import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { FlaskConical } from "lucide-react";
import { apiFetch, useSession } from "@/lib/session";
import { Badge, CheckList, ErrorBanner, inputClass, primaryButton, secondaryButton } from "@/components/store/shared";
import {
    MAX_ACTIVE_BONUSES,
    MAX_PREVIEW_ITEMS,
    comboForSet,
    cosmeticLabel,
    hiddenNote,
    previewBonuses,
    type BonusRef,
    type CatalogWithKeys,
    type SetInfo,
} from "@/lib/sets-api";

export function TestCombo({ sets, catalog }: { sets: SetInfo[]; catalog: CatalogWithKeys | undefined }) {
    const session = useSession();
    const [selected, setSelected] = useState<number[]>([]);
    const [tooMany, setTooMany] = useState(false);
    const [fillError, setFillError] = useState<string | null>(null);
    const [tested, setTested] = useState<{ ids: number[]; bonuses: BonusRef[] } | null>(null);

    const test = useMutation({
        mutationFn: (ids: number[]) => previewBonuses((path, init) => apiFetch(session, path, init), ids),
        onSuccess: (bonuses, ids) => setTested({ ids, bonuses }),
    });

    const items = useMemo(
        () =>
            (catalog?.cosmetics ?? [])
                .map((cosmetic) => {
                    const note = hiddenNote(catalog, cosmetic);
                    return {
                        id: cosmetic.id,
                        label: cosmeticLabel(catalog, cosmetic.id),
                        hint: `${cosmetic.type}${note ? ` · ${note}` : ""} · #${cosmetic.id}`,
                    };
                })
                .sort((a, b) => a.label.localeCompare(b.label)),
        [catalog],
    );
    const setName = (id: number) => sets.find((set) => set.id === id)?.name ?? `Set #${id}`;

    return (
        <div className="flex flex-col gap-3 rounded-lg bg-gray-800 p-4 shadow-xl">
            <div className="flex flex-wrap items-center gap-3">
                <select
                    value=""
                    onChange={(event) => {
                        const set = sets.find((item) => item.id === Number(event.target.value));
                        if (!set) return;
                        const combo = comboForSet(set, catalog);
                        setTooMany(false);
                        if (combo.ok) {
                            setSelected(combo.ids);
                            setFillError(null);
                        } else {
                            setFillError(`Couldn't fill from ${set.name}. ${combo.error}`);
                        }
                    }}
                    className={inputClass}
                    aria-label="Fill from a set"
                >
                    <option value="">Fill from a set…</option>
                    {sets.map((set) => (
                        <option key={set.id} value={set.id}>
                            {set.name}
                        </option>
                    ))}
                </select>
                <button
                    type="button"
                    disabled={!selected.length}
                    onClick={() => {
                        setSelected([]);
                        setTooMany(false);
                        setFillError(null);
                    }}
                    className={secondaryButton}
                >
                    Clear
                </button>
            </div>
            <CheckList
                items={items}
                selected={selected}
                onChange={(next) => {
                    if (next.length > MAX_PREVIEW_ITEMS) {
                        setTooMany(true);
                        return;
                    }
                    setTooMany(false);
                    setFillError(null);
                    setSelected(next);
                }}
                empty="The catalog is empty."
            />
            {fillError && <p className="text-sm text-amber-300">{fillError}</p>}
            {tooMany && <p className="text-sm text-amber-300">You can test at most {MAX_PREVIEW_ITEMS} cosmetics at once.</p>}
            <button
                type="button"
                disabled={!selected.length || test.isPending}
                onClick={() => test.mutate(selected)}
                className={primaryButton}
            >
                <FlaskConical size={16} />
                {test.isPending ? "Testing…" : "Test"}
            </button>
            <ErrorBanner error={test.error} />
            {tested && (
                <div className="flex flex-col gap-2 rounded border border-gray-700 bg-gray-900/40 p-3 text-sm">
                    <div className="text-gray-400">
                        {tested.ids.map((id) => cosmeticLabel(catalog, id)).join(", ")}
                    </div>
                    {tested.bonuses.length ? (
                        <ul className="flex flex-col gap-1">
                            {tested.bonuses.map((bonus, index) => (
                                <li key={bonus.id} className="flex items-center gap-2 text-gray-200">
                                    <Badge tone="green">{index + 1}</Badge>
                                    {setName(bonus.id)}
                                    {!bonus.url && <Badge tone="amber">no effect</Badge>}
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-gray-300">No set fires with these.</p>
                    )}
                    {tested.bonuses.length >= MAX_ACTIVE_BONUSES && (
                        <p className="text-xs text-gray-500">
                            Only {MAX_ACTIVE_BONUSES} sets apply at once, so others may match too.
                        </p>
                    )}
                </div>
            )}
        </div>
    );
}
