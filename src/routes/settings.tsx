import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Save, SlidersHorizontal } from "lucide-react";
import { useAdminMutation, useAdminQuery } from "@/lib/store-api";
import {
    ErrorBanner,
    Field,
    Panel,
    PayloadPreview,
    inputClass,
    primaryButton,
} from "@/components/store/shared";

export const Route = createFileRoute("/settings")({
    component: SettingsPage,
});

/** Sections of numbers; rendered from whatever the backend sends, so new fields just appear. */
type Settings = Record<string, Record<string, number>>;

/** The backend's doc comments, for the fields that need one. */
const HELP: Record<string, string> = {
    "cluster_sharing.max_payload_bytes": "The largest a single instance may be",
    "cluster_sharing.max_account_bytes": "Everything a player syncs and shares, together",
    "cluster_sharing.public_share_ttl_secs": "How long a public share lasts after it was last downloaded or updated",
    "cluster_sharing.large_write_bytes": "Writes over this size also count against the large-writes limit",
    "cluster_sharing.max_tombstones": "Deleted instances remembered per player, so other devices learn of it",
    "chat.max_message_length": "For group, DM and party chat messages",
    "chat.special_chat_cooldown_secs": "Between one player's messages to a Special Chat target",
};

const SECTIONS: Record<string, string> = {
    cluster_sharing: "OneClient cloud sync and share codes. Served to every player.",
    chat: "Social chat limits.",
    outfits: "Wardrobe limits per player.",
};

const label = (key: string) => {
    const words = key.replace(/_(secs|bytes)$/, "").replaceAll("_", " ");
    return words[0].toUpperCase() + words.slice(1);
};

/** A readable gloss under the raw number, for seconds and bytes. */
function gloss(key: string, value: number): string | undefined {
    if (key.endsWith("_secs")) {
        const units: [number, string][] = [
            [86_400, "day"],
            [3_600, "hour"],
            [60, "minute"],
            [1, "second"],
        ];
        const [size, unit] = units.find(([size]) => value >= size && value % size === 0) ?? [1, "second"];
        const n = value / size;
        return `seconds · ${n} ${unit}${n === 1 ? "" : "s"}`;
    }
    if (key.endsWith("_bytes")) {
        const units = ["B", "KiB", "MiB", "GiB", "TiB"];
        let n = value;
        let i = 0;
        while (n >= 1024 && i < units.length - 1) {
            n /= 1024;
            i++;
        }
        return `bytes · ${Number(n.toFixed(2))} ${units[i]}`;
    }
}

function SettingsPage() {
    const settings = useAdminQuery<Settings>("/v1/admin/settings");

    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
            <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-100">
                <SlidersHorizontal size={22} className="text-[#61dafb]" />
                Server settings
            </h1>
            <p className="-mt-4 text-sm text-gray-500">
                Limits that apply straight away, without a restart. They are kept in a file on the
                backend, so with several instances only the one that answered changes.
            </p>
            <ErrorBanner error={settings.error} />
            {settings.isPending && <p className="text-sm text-gray-500">Loading settings…</p>}
            {/* Remounted on every save so the form starts from what is now in force. */}
            {settings.data && <SettingsForm key={settings.dataUpdatedAt} current={settings.data} />}
        </div>
    );
}

function SettingsForm({ current }: { current: Settings }) {
    const [draft, setDraft] = useState<Record<string, string>>({});

    // Only what changed goes out: the backend applies a JSON merge patch.
    const patch: Settings = {};
    for (const [path, raw] of Object.entries(draft)) {
        const [section, key] = path.split(".");
        if (raw.trim() === "" || Number(raw) === current[section][key]) continue;
        (patch[section] ??= {})[key] = Number(raw);
    }
    const changed = Object.keys(patch).length > 0;

    const save = useAdminMutation<void>(() => ({
        method: "PATCH",
        path: "/v1/admin/settings",
        body: patch,
    }));

    return (
        <form
            onSubmit={(event) => {
                event.preventDefault();
                save.mutate();
            }}
            className="flex flex-col gap-6"
        >
            {Object.entries(current).map(([section, fields]) => (
                <Panel key={section} title={label(section)} description={SECTIONS[section] ?? ""}>
                    <div className="grid gap-3 rounded-lg bg-gray-800 p-4 shadow-xl sm:grid-cols-2 lg:grid-cols-3">
                        {Object.entries(fields).map(([key, value]) => {
                            const path = `${section}.${key}`;
                            const shown = draft[path] ?? String(value);
                            return (
                                <Field
                                    key={key}
                                    label={label(key)}
                                    help={[gloss(key, Number(shown)), HELP[path]].filter(Boolean).join(" — ")}
                                >
                                    <input
                                        type="number"
                                        min={0}
                                        step={1}
                                        value={shown}
                                        onChange={(event) => setDraft({ ...draft, [path]: event.target.value })}
                                        className={`${inputClass} ${shown !== String(value) ? "border-[#61dafb]" : ""}`}
                                    />
                                </Field>
                            );
                        })}
                    </div>
                </Panel>
            ))}
            <PayloadPreview body={patch} />
            <ErrorBanner error={save.error} />
            <button type="submit" disabled={!changed || save.isPending} className={primaryButton}>
                <Save size={16} />
                {save.isPending ? "Saving…" : "Save changes"}
            </button>
        </form>
    );
}
