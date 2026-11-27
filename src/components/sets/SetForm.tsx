import { useState } from "react";
import { Plus, Save } from "lucide-react";
import {
    Field,
    PayloadPreview,
    fromLocalInput,
    inputClass,
    primaryButton,
    secondaryButton,
    toLocalInput,
} from "@/components/store/shared";
import { RequirementEditor } from "@/components/sets/RequirementEditor";
import { AnalysisTable, IssueList, OutcomeNotes, ProblemBanner } from "@/components/IssueList";
import { useEffectCheck } from "@/components/sets/useEffectCheck";
import {
    MAX_REQUIREMENTS,
    MAX_SET_NAME,
    buildSetBody,
    draftFromSet,
    effectOutcome,
    emptyDraft,
    repeatWarning,
    useSaveSet,
    useUploadSetEffect,
    type CatalogWithKeys,
    type EffectOutcome,
    type SetInfo,
} from "@/lib/sets-api";

export function SetForm({
    initial,
    catalog,
    onSaved,
}: {
    initial?: SetInfo;
    catalog: CatalogWithKeys | undefined;
    onSaved?: () => void;
}) {
    const [draft, setDraft] = useState(() => (initial ? draftFromSet(initial) : emptyDraft()));
    const [attempted, setAttempted] = useState(false);
    const [effect, setEffect] = useState<File | null>(null);
    const [fileKey, setFileKey] = useState(0);
    const save = useSaveSet();
    const upload = useUploadSetEffect();
    const [outcome, setOutcome] = useState<EffectOutcome | null>(null);

    const built = buildSetBody(draft);
    const repeat = repeatWarning(
        catalog,
        draft.requirements.flatMap((requirement) =>
            requirement.kind === "cosmetic" && requirement.cosmeticId != null
                ? [{ cosmetic_id: requirement.cosmeticId }]
                : [],
        ),
    );
    const check = useEffectCheck(effect);
    const patch = (next: Partial<typeof draft>) => setDraft({ ...draft, ...next });

    return (
        <form
            onSubmit={(event) => {
                event.preventDefault();
                setAttempted(true);
                if (!built.ok || check.blocked) return;
                upload.reset();
                setOutcome(null);
                save.mutate(
                    { id: initial?.id, body: built.body },
                    {
                        onSuccess: (result) => {
                            const saved = result as SetInfo;
                            if (!initial) {
                                setDraft(emptyDraft());
                                setEffect(null);
                                setFileKey(fileKey + 1);
                                setAttempted(false);
                            }
                            if (effect && saved?.id != null) {
                                upload.mutate(
                                    { setId: saved.id, file: effect },
                                    { onSuccess: (data) => setOutcome(effectOutcome(data)) },
                                );
                            }
                            onSaved?.();
                        },
                    },
                );
            }}
            className={initial ? "flex flex-col gap-3" : "flex flex-col gap-3 rounded-lg bg-gray-800 p-4 shadow-xl"}
        >
            <div className="font-semibold text-gray-300">{initial ? `Edit ${initial.name}` : "Create a set"}</div>
            <div className="flex flex-wrap gap-3">
                <Field label="Name" help="Players see this when they discover the set">
                    <input
                        value={draft.name}
                        onChange={(event) => patch({ name: event.target.value })}
                        maxLength={MAX_SET_NAME}
                        placeholder="Night Watch"
                        className={inputClass}
                    />
                </Field>
                <Field label="Priority" help="Higher wins when more than two sets match">
                    <input
                        type="number"
                        step={1}
                        value={draft.priority}
                        onChange={(event) => patch({ priority: event.target.value })}
                        className={inputClass}
                    />
                </Field>
                <Field label="Starts" help="Your local time. Leave empty to start now">
                    <input
                        type="datetime-local"
                        value={toLocalInput(draft.activeFrom)}
                        onChange={(event) => patch({ activeFrom: fromLocalInput(event.target.value) })}
                        className={inputClass}
                    />
                </Field>
                <Field label="Ends" help="Leave empty to run forever">
                    <input
                        type="datetime-local"
                        value={toLocalInput(draft.activeUntil)}
                        onChange={(event) => patch({ activeUntil: fromLocalInput(event.target.value) })}
                        className={inputClass}
                    />
                </Field>
            </div>

            <div className="flex flex-col gap-2">
                <div className="text-sm text-gray-400">
                    Requirements ({draft.requirements.length} of {MAX_REQUIREMENTS}). The player has to wear all of
                    them at once, each in its own slot.
                </div>
                {draft.requirements.map((requirement, index) => (
                    <RequirementEditor
                        key={index}
                        index={index}
                        value={requirement}
                        catalog={catalog}
                        onChange={(next) =>
                            patch({ requirements: draft.requirements.map((item, i) => (i === index ? next : item)) })
                        }
                        onRemove={
                            draft.requirements.length > 1
                                ? () => patch({ requirements: draft.requirements.filter((_, i) => i !== index) })
                                : undefined
                        }
                    />
                ))}
                <button
                    type="button"
                    disabled={draft.requirements.length >= MAX_REQUIREMENTS}
                    onClick={() =>
                        patch({ requirements: [...draft.requirements, { kind: "cosmetic", cosmeticId: null }] })
                    }
                    className={secondaryButton}
                >
                    <Plus size={14} />
                    Add a requirement
                </button>
                {repeat && <p className="text-sm text-amber-300">{repeat}</p>}
            </div>

            {initial ? (
                initial.effect_asset_id != null && (
                    <label className="flex items-center gap-2 text-sm text-gray-400">
                        <input
                            type="checkbox"
                            checked={draft.effectAssetId === null}
                            onChange={(event) =>
                                patch({ effectAssetId: event.target.checked ? null : initial.effect_asset_id })
                            }
                            className="h-4 w-4 accent-[#61dafb]"
                        />
                        Remove the effect (the set still counts, but shows nothing)
                    </label>
                )
            ) : (
                <Field label="Effect (optional)" help="A .zip effect bundle, 4 MiB at most. You can add it later too">
                    <input
                        key={fileKey}
                        type="file"
                        accept=".zip,application/zip"
                        onChange={(event) => {
                            setEffect(event.target.files?.[0] ?? null);
                            setOutcome(null);
                        }}
                        className="text-sm text-gray-400 file:mr-3 file:rounded file:border file:border-gray-600 file:bg-gray-700 file:px-3 file:py-1.5 file:text-gray-200"
                    />
                </Field>
            )}

            {attempted && !built.ok && <p className="text-sm text-amber-300">{built.error}</p>}
            {check.busy && <p className="text-xs text-gray-500">Checking the effect…</p>}
            {check.problem && <p className="text-sm text-amber-300">{check.problem}</p>}
            {check.note && <p className="text-xs text-gray-500">{check.note}</p>}
            {check.report?.status === "invalid" && (
                <p className="text-sm text-red-300">The effect has errors, so the set can't be saved with it. Fix them, or pick another file.</p>
            )}
            <IssueList issues={check.report?.issues ?? []} />
            {check.analysis && (
                <div className="flex flex-col gap-1 text-sm">
                    <span className="text-gray-400">Checked in your browser:</span>
                    <AnalysisTable analysis={check.analysis} />
                </div>
            )}
            {outcome && (
                <div className="flex flex-col gap-2">
                    <p className="text-sm text-green-300">The set was saved and its effect uploaded.</p>
                    <OutcomeNotes outcome={outcome} />
                </div>
            )}
            <ProblemBanner error={save.error} />
            {upload.error && (
                <>
                    <p className="text-sm text-amber-300">
                        The set was saved, but we couldn't confirm its effect uploaded. Check the set's row before trying again.
                    </p>
                    <ProblemBanner error={upload.error} />
                </>
            )}

            {built.ok && <PayloadPreview body={initial ? { id: initial.id, ...built.body } : built.body} />}
            <button type="submit" disabled={save.isPending || upload.isPending || check.busy} className={primaryButton}>
                <Save size={16} />
                {save.isPending || upload.isPending ? "Saving…" : initial ? "Save changes" : "Create set"}
            </button>
        </form>
    );
}
