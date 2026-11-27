import { useMemo } from "react";
import { X } from "lucide-react";
import { inputClass } from "@/components/store/shared";
import { cosmeticLabel, hiddenNote, variantKeys, type CatalogWithKeys, type RequirementDraft } from "@/lib/sets-api";

const KINDS: { value: RequirementDraft["kind"]; label: string }[] = [
    { value: "cosmetic", label: "One cosmetic" },
    { value: "group", label: "Any variant of a group" },
    { value: "variant", label: "One variant of a group" },
];

function switchKind(current: RequirementDraft, kind: RequirementDraft["kind"]): RequirementDraft {
    const groupId = current.kind === "cosmetic" ? null : current.groupId;
    if (kind === "cosmetic") return { kind, cosmeticId: null };
    if (kind === "group") return { kind, groupId };
    return { kind, groupId, variantKey: current.kind === "variant" ? current.variantKey : "" };
}

export function RequirementEditor({
    index,
    value,
    catalog,
    onChange,
    onRemove,
}: {
    index: number;
    value: RequirementDraft;
    catalog: CatalogWithKeys | undefined;
    onChange: (next: RequirementDraft) => void;
    onRemove?: () => void;
}) {
    const cosmetics = useMemo(
        () =>
            (catalog?.cosmetics ?? [])
                .map((cosmetic) => ({
                    id: cosmetic.id,
                    type: cosmetic.type,
                    label: cosmeticLabel(catalog, cosmetic.id),
                    hidden: hiddenNote(catalog, cosmetic),
                }))
                .sort((a, b) => a.type.localeCompare(b.type) || a.label.localeCompare(b.label)),
        [catalog],
    );
    const types = useMemo(() => [...new Set(cosmetics.map((cosmetic) => cosmetic.type))], [cosmetics]);
    const groups = useMemo(
        () => [...(catalog?.groups ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
        [catalog],
    );
    const keys = value.kind === "variant" ? variantKeys(catalog, value.groupId) : [];
    const listId = `set-variant-keys-${index}`;

    return (
        <div className="flex flex-wrap items-end gap-2 rounded border border-gray-700 bg-gray-900/40 p-3">
            <span className="w-6 pb-2 text-sm text-gray-500">{index + 1}.</span>
            <select
                value={value.kind}
                onChange={(event) => onChange(switchKind(value, event.target.value as RequirementDraft["kind"]))}
                className={inputClass}
                aria-label={`Requirement ${index + 1} kind`}
            >
                {KINDS.map((kind) => (
                    <option key={kind.value} value={kind.value}>
                        {kind.label}
                    </option>
                ))}
            </select>

            {value.kind === "cosmetic" ? (
                <select
                    value={value.cosmeticId ?? ""}
                    onChange={(event) =>
                        onChange({ kind: "cosmetic", cosmeticId: event.target.value ? Number(event.target.value) : null })
                    }
                    className={`${inputClass} min-w-60 flex-1`}
                    aria-label={`Requirement ${index + 1} cosmetic`}
                >
                    <option value="">Pick a cosmetic</option>
                    {types.map((type) => (
                        <optgroup key={type} label={type}>
                            {cosmetics
                                .filter((cosmetic) => cosmetic.type === type)
                                .map((cosmetic) => (
                                    <option key={cosmetic.id} value={cosmetic.id}>
                                        {cosmetic.label} #{cosmetic.id}
                                        {cosmetic.hidden ? ` (${cosmetic.hidden})` : ""}
                                    </option>
                                ))}
                        </optgroup>
                    ))}
                </select>
            ) : (
                <select
                    value={value.groupId ?? ""}
                    onChange={(event) =>
                        onChange({ ...value, groupId: event.target.value ? Number(event.target.value) : null })
                    }
                    className={`${inputClass} min-w-48 flex-1`}
                    aria-label={`Requirement ${index + 1} group`}
                >
                    <option value="">Pick a group</option>
                    {groups.map((group) => (
                        <option key={group.id} value={group.id}>
                            {group.name} ({group.type}) #{group.id}
                            {group.enabled ? "" : " (hidden)"}
                        </option>
                    ))}
                </select>
            )}

            {value.kind === "variant" && (
                <>
                    <input
                        value={value.variantKey}
                        onChange={(event) => onChange({ ...value, variantKey: event.target.value })}
                        placeholder="Variant key, e.g. red"
                        maxLength={64}
                        list={keys.length ? listId : undefined}
                        className={`${inputClass} w-44 font-mono`}
                        aria-label={`Requirement ${index + 1} variant key`}
                    />
                    {keys.length > 0 && (
                        <datalist id={listId}>
                            {keys.map((key) => (
                                <option key={key} value={key} />
                            ))}
                        </datalist>
                    )}
                </>
            )}

            {onRemove && (
                <button
                    type="button"
                    onClick={onRemove}
                    title="Remove requirement"
                    className="pb-2 text-gray-500 hover:text-red-300"
                >
                    <X size={16} />
                </button>
            )}
        </div>
    );
}
