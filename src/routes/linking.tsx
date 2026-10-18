import { createFileRoute } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { Link as LinkIcon, Search, ExternalLink } from "lucide-react";
import { useRequiredSession } from "@/lib/session";
import { adminRequest } from "@/lib/store-api";
import {
    ErrorBanner,
    Field,
    Panel,
    inputClass,
    primaryButton,
} from "@/components/store/shared";

export const Route = createFileRoute("/linking")({
    component: Linking,
});

/** Mirrors the backend's `LinkProvider`. */
const PROVIDERS = ["discord"] as const;

function Linking() {
    return (
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
            <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-100">
                <LinkIcon size={22} className="text-[#61dafb]" />
                Provider linking
            </h1>
            <Lookup />
            <StartLink />
        </div>
    );
}

function Lookup() {
    const session = useRequiredSession();
    const [provider, setProvider] = useState<string>(PROVIDERS[0]);
    const [id, setId] = useState("");
    const lookup = useMutation({
        mutationFn: () =>
            adminRequest(
                session,
                "GET",
                `/v0/players/by-link/${provider}/${encodeURIComponent(id.trim())}`,
            ) as Promise<{ id: string; username: string | null }>,
    });

    return (
        <Panel
            title="Verify a link"
            description="Resolves a provider user id (e.g. a Discord user id) to the player who linked it."
        >
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    lookup.mutate();
                }}
                className="flex flex-wrap items-end gap-3"
            >
                <Field label="Provider">
                    <select
                        value={provider}
                        onChange={(event) => setProvider(event.target.value)}
                        className={inputClass}
                    >
                        {PROVIDERS.map((p) => (
                            <option key={p}>{p}</option>
                        ))}
                    </select>
                </Field>
                <Field label="Provider user id">
                    <input
                        value={id}
                        onChange={(event) => setId(event.target.value)}
                        required
                        placeholder="123456789012345678"
                        className={`${inputClass} font-mono`}
                    />
                </Field>
                <button
                    type="submit"
                    disabled={!id.trim() || lookup.isPending}
                    className={primaryButton}
                >
                    <Search size={16} />
                    Look up
                </button>
            </form>
            {lookup.data && (
                <div className="rounded border border-green-700 bg-green-900/30 px-4 py-3 text-sm text-green-200">
                    Linked to {lookup.data.username ?? "unknown username"}
                    <div className="font-mono text-xs text-green-300">
                        {lookup.data.id}
                    </div>
                </div>
            )}
            {/* The backend answers 404 with "player missing" when nobody linked it. */}
            <ErrorBanner error={lookup.error} />
        </Panel>
    );
}

function StartLink() {
    const session = useRequiredSession();
    const [token, setToken] = useState("");
    const start = useMutation({
        mutationFn: async () => {
            const { url } = (await adminRequest(
                { env: session.env, password: `Bearer ${token.trim()}` },
                "POST",
                "/v0/account/links/discord",
            )) as { url: string };
            window.open(url, "_blank", "noopener");
            return url;
        },
    });

    return (
        <Panel
            title="Start a Discord link"
            description="Starting a link needs a player token, not the admin password: the link goes to whoever the token belongs to. Opens Discord's consent screen in a new tab; the link expires after 10 minutes."
        >
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    start.mutate();
                }}
                className="flex flex-wrap items-end gap-3"
            >
                <Field label="Player token">
                    <input
                        value={token}
                        onChange={(event) => setToken(event.target.value)}
                        required
                        type="password"
                        placeholder="v4.local…"
                        className={`${inputClass} font-mono`}
                    />
                </Field>
                <button
                    type="submit"
                    disabled={!token.trim() || start.isPending}
                    className={primaryButton}
                >
                    <ExternalLink size={16} />
                    Start linking
                </button>
            </form>
            {start.data && (
                <a
                    href={start.data}
                    target="_blank"
                    rel="noreferrer"
                    className="break-all text-sm text-[#61dafb] hover:underline"
                >
                    Popup blocked? Open the Discord link
                </a>
            )}
            <ErrorBanner error={start.error} />
        </Panel>
    );
}
