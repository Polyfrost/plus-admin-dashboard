import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useEffect, useState } from "react";
import { Layers, Pencil, Upload, X } from "lucide-react";
import { useCatalog } from "@/lib/store-api";
import { Badge, DeleteButton, ErrorBanner, Panel, Table } from "@/components/store/shared";
import { SetForm } from "@/components/sets/SetForm";
import { EffectUpload } from "@/components/sets/EffectUpload";
import { TestCombo } from "@/components/sets/TestCombo";
import {
    boundaryDelay,
    requirementLabel,
    useDeleteSet,
    useSets,
    windowStatus,
    type CatalogWithKeys,
    type SetInfo,
} from "@/lib/sets-api";

export const Route = createFileRoute("/sets")({
    component: Sets,
});

const STATUS = {
    always: { tone: "green", label: "always on" },
    live: { tone: "green", label: "live" },
    scheduled: { tone: "blue", label: "scheduled" },
    ended: { tone: "gray", label: "ended" },
} as const;

function formatWindow(set: SetInfo): string {
    const from = set.active_from ? new Date(set.active_from).toLocaleString() : null;
    const until = set.active_until ? new Date(set.active_until).toLocaleString() : null;
    if (from && until) return `${from} → ${until}`;
    if (from) return `From ${from}`;
    if (until) return `Until ${until}`;
    return "No time limit";
}

function useWindowClock(sets: SetInfo[] | undefined): number {
    const [now, setNow] = useState(() => Date.now());
    const [seen, setSeen] = useState(sets);
    if (seen !== sets) {
        setSeen(sets);
        setNow(Date.now());
    }
    useEffect(() => {
        const delay = boundaryDelay(sets ?? []);
        if (delay === null) return;
        const timer = setTimeout(() => setNow(Date.now()), delay);
        return () => clearTimeout(timer);
    }, [sets, now]);
    return now;
}

function Sets() {
    const sets = useSets();
    const catalog = useCatalog();
    const data = catalog.data as CatalogWithKeys | undefined;
    const remove = useDeleteSet();
    const now = useWindowClock(sets.data);
    const [open, setOpen] = useState<{ id: number; view: "edit" | "effect" } | null>(null);
    const toggle = (id: number, view: "edit" | "effect") =>
        setOpen(open?.id === id && open.view === view ? null : { id, view });

    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
            <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-100">
                <Layers size={22} className="text-[#61dafb]" />
                Sets
            </h1>
            <Panel
                title="Outfit sets"
                description="A set is a group of cosmetics that gives an extra effect when a player wears all of them together. Sets are secret: players find them by trying outfits, and the first time they complete one it's saved as a discovery. Up to two sets apply at once, highest priority first, then the oldest."
            >
                <SetForm catalog={data} />
                <ErrorBanner error={sets.error ?? catalog.error ?? remove.error} />
                <Table
                    headers={["Name", "Requirements", "Priority", "Window", "Effect", ""]}
                    empty={!sets.isPending && !sets.data?.length}
                >
                    {sets.data?.map((set) => {
                        const status = STATUS[windowStatus(set, now)];
                        return (
                            <Fragment key={set.id}>
                                <tr>
                                    <td className="px-4 py-3">
                                        {set.name}
                                        <div className="text-xs text-gray-500">#{set.id}</div>
                                    </td>
                                    <td className="max-w-sm px-4 py-3 text-gray-400">
                                        <ul className="flex flex-col gap-0.5">
                                            {set.requirements.map((requirement, index) => (
                                                <li key={index} className="truncate">
                                                    {requirementLabel(data, requirement)}
                                                </li>
                                            ))}
                                        </ul>
                                    </td>
                                    <td className="px-4 py-3">{set.priority}</td>
                                    <td className="px-4 py-3">
                                        <Badge tone={status.tone}>{status.label}</Badge>
                                        <div className="mt-1 text-xs text-gray-500">{formatWindow(set)}</div>
                                    </td>
                                    <td className="px-4 py-3">
                                        {set.effect_url ? (
                                            <a
                                                href={set.effect_url}
                                                className="text-sm text-[#61dafb] hover:underline"
                                            >
                                                Download
                                            </a>
                                        ) : set.effect_asset_id != null ? (
                                            <span className="text-xs text-gray-500">Asset #{set.effect_asset_id}</span>
                                        ) : (
                                            <Badge tone="amber">none</Badge>
                                        )}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            <button
                                                onClick={() => toggle(set.id, "effect")}
                                                title="Preview or upload the effect"
                                                className="text-gray-400 hover:text-gray-100"
                                            >
                                                {open?.id === set.id && open.view === "effect" ? (
                                                    <X size={16} />
                                                ) : (
                                                    <Upload size={16} />
                                                )}
                                            </button>
                                            <button
                                                onClick={() => toggle(set.id, "edit")}
                                                title="Edit"
                                                className="text-gray-400 hover:text-gray-100"
                                            >
                                                {open?.id === set.id && open.view === "edit" ? (
                                                    <X size={16} />
                                                ) : (
                                                    <Pencil size={16} />
                                                )}
                                            </button>
                                            <DeleteButton
                                                pending={remove.isPending}
                                                onDelete={() => {
                                                    if (
                                                        confirm(
                                                            `Delete "${set.name}"? This also wipes every player's discovery of this set. It can't be undone.`,
                                                        )
                                                    ) {
                                                        remove.mutate(set.id);
                                                    }
                                                }}
                                            />
                                        </div>
                                    </td>
                                </tr>
                                {open?.id === set.id && (
                                    <tr>
                                        <td colSpan={6} className="bg-gray-900/40 px-4 py-4">
                                            {open.view === "edit" ? (
                                                <SetForm
                                                    key={set.id}
                                                    initial={set}
                                                    catalog={data}
                                                    onSaved={() => setOpen(null)}
                                                />
                                            ) : (
                                                <EffectUpload key={set.id} set={set} />
                                            )}
                                        </td>
                                    </tr>
                                )}
                            </Fragment>
                        );
                    })}
                </Table>
            </Panel>
            <Panel
                title="Test a combo"
                description="Pick cosmetics to see which sets they'd complete right now. They have to fit one per slot. Hidden cosmetics count too, and nobody has to own them. Nothing is saved."
            >
                <TestCombo sets={sets.data ?? []} catalog={data} />
            </Panel>
        </div>
    );
}
