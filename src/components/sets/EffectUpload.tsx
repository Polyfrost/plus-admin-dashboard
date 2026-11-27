import { useMemo, useState } from "react";
import { Upload } from "lucide-react";
import { secondaryButton } from "@/components/store/shared";
import { CosmeticPreview } from "@/components/CosmeticPreview";
import { AnalysisTable, IssueList, OutcomeNotes, ProblemBanner } from "@/components/IssueList";
import { useEffectCheck } from "@/components/sets/useEffectCheck";
import { effectOutcome, useUploadSetEffect, type EffectOutcome, type SetInfo } from "@/lib/sets-api";

export function EffectUpload({ set }: { set: SetInfo }) {
    const upload = useUploadSetEffect();
    const [file, setFile] = useState<File | null>(null);
    const [outcome, setOutcome] = useState<EffectOutcome | null>(null);
    const check = useEffectCheck(file);
    const picked = useMemo(() => (file ? [file] : null), [file]);
    const source = picked ?? set.effect_url ?? null;

    return (
        <div className="grid gap-4 md:grid-cols-[1fr_320px]">
            <div className="flex flex-col gap-2">
                <div className="font-semibold text-gray-300">
                    {set.effect_asset_id == null ? "Upload an effect" : "Replace the effect"}
                </div>
                <p className="text-xs text-gray-500">
                    A .zip with manifest.json at the root and kind set to "effect". 4 MiB at most. Players wearing the
                    set get the new effect right away.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                    <input
                        type="file"
                        accept=".zip,application/zip"
                        onChange={(event) => {
                            setFile(event.target.files?.[0] ?? null);
                            setOutcome(null);
                            upload.reset();
                        }}
                        className="text-sm text-gray-400 file:mr-3 file:rounded file:border file:border-gray-600 file:bg-gray-700 file:px-3 file:py-1.5 file:text-gray-200"
                    />
                    <button
                        type="button"
                        disabled={!file || check.blocked || upload.isPending}
                        onClick={() =>
                            file && upload.mutate({ setId: set.id, file }, { onSuccess: (data) => setOutcome(effectOutcome(data)) })
                        }
                        className={secondaryButton}
                    >
                        <Upload size={14} />
                        {upload.isPending ? "Uploading…" : "Upload"}
                    </button>
                    {outcome && <span className="text-sm text-green-300">Uploaded.</span>}
                </div>
                {check.busy && <p className="text-xs text-gray-500">Checking the bundle…</p>}
                {check.problem && <p className="text-sm text-amber-300">{check.problem}</p>}
                {check.note && <p className="text-xs text-gray-500">{check.note}</p>}
                {check.report?.status === "invalid" && (
                    <p className="text-sm text-red-300">This effect can't be uploaded until the errors below are fixed.</p>
                )}
                <IssueList issues={check.report?.issues ?? []} />
                {check.analysis && !outcome && (
                    <div className="flex flex-col gap-1 text-sm">
                        <span className="text-gray-400">Checked in your browser:</span>
                        <AnalysisTable analysis={check.analysis} />
                    </div>
                )}
                <OutcomeNotes outcome={outcome} />
                <ProblemBanner error={upload.error} />
            </div>
            <div className="flex flex-col gap-2">
                <span className="text-sm text-gray-400">{file ? "Preview of the picked file" : "Preview"}</span>
                {source ? (
                    <CosmeticPreview source={source} type="effect" bodySlot="effect_a" className="h-72 w-full" />
                ) : (
                    <p className="text-xs text-gray-500">
                        {set.effect_asset_id == null
                            ? "This set has no effect yet. Pick a file to preview it."
                            : "The current effect has no download link, so it can't be shown here."}
                    </p>
                )}
            </div>
        </div>
    );
}
