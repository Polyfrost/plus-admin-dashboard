import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { zipSync } from "fflate";
import {
    ArrowLeft,
    ArrowRight,
    Check,
    Eye,
    EyeOff,
    FileUp,
    FolderUp,
    ImagePlus,
    ImageUp,
    Plus,
    RefreshCw,
    Save,
    Shirt,
    Trash2,
    Upload,
    X,
} from "lucide-react";
import {
    UNCHECKED_SALE_HINT,
    catalogCheckedSince,
    cosmeticUnits,
    findUploadGroup,
    formatPrice,
    groupAfterPublish,
    groupState,
    publishProblem,
    uploadSaleHint,
    useAdminMutation,
    useCatalog,
    type CatalogCosmetic,
    type CosmeticUnit,
    type GroupState,
} from "@/lib/store-api";
import {
    COSMETIC_TYPES,
    DEFAULT_SLOTS,
    MAX_COVER_BYTES,
    MAX_COVER_SIDE,
    SLOT_HINTS,
    buildCreateForm,
    buildReplaceForm,
    buildVariantUpdate,
    bundleProblems,
    coverMode,
    coverProblems,
    formatBytes,
    hasRootManifest,
    inferEffectSlots,
    inspectFiles,
    inspectSingle,
    isJunkPath,
    manifestVariantKeys,
    needsVariantKey,
    parseUploadOutcome,
    sharedAssetVariants,
    slotOptions,
    uploadVisibility,
    validateSlots,
    variantKeyProblems,
    type BodySlot,
    type BundleInfo,
    type CosmeticType,
    type EffectContent,
    type Issue,
    type NamedBlob,
    type UploadOutcome,
} from "@/lib/cosmetics-api";
import {
    Badge,
    CheckList,
    ErrorBanner,
    Field,
    Toggle,
    inputClass,
    primaryButton,
    secondaryButton,
} from "@/components/store/shared";
import { blocksUpload, checkBundle, type BundleReport as EngineReport } from "@/lib/bundle-check";
import { CosmeticPreview, type PreviewSource } from "@/components/CosmeticPreview";
import { needsDashboardCover, makeCoverFile, useAutoCover, type AutoCover, type CoverRequest } from "@/components/preview/autoCover";
import { useCoverMaker, useCoverUpload, type CoverMade } from "@/components/preview/coverMaker";
import { IssueList, OutcomeNotes, ProblemBanner } from "@/components/IssueList";

export const Route = createFileRoute("/cosmetics")({
    component: CosmeticsRoute,
});

const TYPES = COSMETIC_TYPES;

/** What to pick in the Files step, per type. */
const fileHint = (type: CosmeticType) =>
    type === "cape"
        ? "A cape texture (.png), or a folder with the texture and its animation sheet."
        : type === "emote"
          ? "A folder or .zip with the emote's animation (.json)."
          : type === "nameplate"
            ? "A folder or .zip with manifest.json (format 1) at the root and the textures it uses."
            : type === "effect"
              ? "A folder or .zip with manifest.json (kind: effect) at the root and the files it uses."
              : "A folder or .zip with the model (.geo.json) and its texture (.png); an animation (.json) is optional. A bundle with manifest.json at the root works too.";

const typeHint = (type: CosmeticType) =>
    type === "emote"
        ? "An animation the player performs"
        : type === "nameplate"
          ? "Shown above the player's name"
          : type === "effect"
            ? "Trails, moments and sounds"
            : `Worn on: ${DEFAULT_SLOTS[type].join(", ")}`;

const previewSlot = (type: string) =>
    DEFAULT_SLOTS[type as CosmeticType]?.[0] ?? "hat";

const relativePath = (file: File) =>
    (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;

const slotItems = (type: string) =>
    slotOptions(type).map((slot) => ({ id: slot as string, label: slot, hint: SLOT_HINTS[slot] }));

const variantLabel = (variant: CatalogCosmetic) =>
    `${variant.variant_name ?? variant.name ?? "Variant"} (#${variant.id})`;

function pickedEntries(files: File[]) {
    return Promise.all(
        files
            .filter((file) => !isJunkPath(relativePath(file)))
            .map(async (file) => {
                const segments = relativePath(file).split("/");
                const inner = segments.length > 1 ? segments.slice(1).join("/") : file.name;
                return { name: inner, bytes: new Uint8Array(await file.arrayBuffer()) };
            }),
    );
}

/** Zips a picked folder in the browser, dropping its top-level directory. */
async function buildBundle(files: File[]) {
    const entries = await pickedEntries(files);
    return { entries, zipped: zipSync(Object.fromEntries(entries.map((entry) => [entry.name, entry.bytes]))) };
}

/** Files picked for one upload: a single file, or a whole folder. */
interface Picked {
    files: File[];
    folder: boolean;
}
const NOTHING: Picked = { files: [], folder: false };

interface Prepared {
    file: NamedBlob;
    info: BundleInfo;
}

async function preparePicked(picked: Picked): Promise<Prepared> {
    if (picked.folder) {
        const { entries, zipped } = await buildBundle(picked.files);
        return {
            file: { blob: new Blob([zipped as BlobPart], { type: "application/zip" }), name: "bundle.zip" },
            info: inspectFiles(entries, zipped.length),
        };
    }
    const file = picked.files[0];
    return {
        file: { blob: file, name: file.name },
        info: inspectSingle(file.name, new Uint8Array(await file.arrayBuffer())),
    };
}

async function prepareChecked(type: string, picked: Picked): Promise<NamedBlob> {
    const prepared = await preparePicked(picked);
    const problems = bundleProblems(type, prepared.info);
    if (problems.length) throw new Error(problems.join(" "));
    return prepared.file;
}

interface FileReport {
    problems: string[];
    issues: Issue[];
    invalid: boolean;
    unchecked: boolean;
    variantKeys: string[];
    colorways: string[];
    manifest: boolean;
    effectContent?: EffectContent;
}
type ReportState = FileReport | "busy" | null;

async function reportFor(type: string, picked: Picked): Promise<FileReport> {
    const { file, info } = await preparePicked(picked);
    const manifest = hasRootManifest(info);
    const base: FileReport = {
        problems: bundleProblems(type, info),
        issues: [],
        invalid: false,
        unchecked: false,
        variantKeys: type === "nameplate" && manifest ? manifestVariantKeys(info.manifest) : [],
        colorways: [],
        manifest,
    };
    if (base.problems.length) return base;
    let engine: EngineReport;
    try {
        engine = await checkBundle(type, file.blob);
    } catch {
        return { ...base, unchecked: true };
    }
    return {
        ...base,
        issues: engine.issues,
        invalid: blocksUpload(engine),
        variantKeys: type === "nameplate" && engine.variantKeys?.length ? engine.variantKeys : base.variantKeys,
        colorways: engine.colorways ?? [],
        effectContent: engine.effectContent,
    };
}

function useBundleReport(type: string, picked: Picked): ReportState {
    const [report, setReport] = useState<ReportState>(null);
    const { files, folder } = picked;

    useEffect(() => {
        if (!files.length) {
            setReport(null);
            return;
        }
        let live = true;
        setReport("busy");
        reportFor(type, { files, folder }).then(
            (next) => live && setReport(next),
            (error: Error) => {
                if (!live) return;
                setReport({
                    problems: [`The files can't be read: ${error.message}`],
                    issues: [],
                    invalid: false,
                    unchecked: false,
                    variantKeys: [],
                    colorways: [],
                    manifest: false,
                });
            },
        );
        return () => {
            live = false;
        };
    }, [type, files, folder]);

    return report;
}

const reportProblems = (report: ReportState) => (report && report !== "busy" ? report.problems : []);
const reportKeys = (report: ReportState) => (report && report !== "busy" ? report.variantKeys : []);
const reportManifest = (report: ReportState) => (report && report !== "busy" ? report.manifest : false);
const reportColorways = (report: ReportState) => (report && report !== "busy" ? report.colorways : []);
const reportInvalid = (report: ReportState) => (report && report !== "busy" ? report.invalid : false);
const keySuggestions = (keys: string[], report: ReportState) => (keys.length ? keys : reportColorways(report));

const coverFile = (blob: Blob) => new File([blob], "preview-cover.png", { type: "image/png" });

async function checkCover(file: File): Promise<string[]> {
    try {
        const bitmap = await createImageBitmap(file);
        const size = { width: bitmap.width, height: bitmap.height };
        bitmap.close();
        return coverProblems(file, size);
    } catch {
        const problems = coverProblems(file);
        return problems.length ? problems : ["The cover can't be read as an image."];
    }
}

async function adoptCover(blob: Blob, use: (file: File) => void): Promise<string[]> {
    const file = coverFile(blob);
    const problems = await checkCover(file);
    if (!problems.length) use(file);
    return problems;
}

function useCreateCosmetic() {
    return useAdminMutation<FormData>((form) => ({
        method: "POST",
        path: "/cosmetics/manage/create",
        body: form,
    }));
}

function CosmeticsRoute() {
    const [creating, setCreating] = useState(false);

    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 p-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                    <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-100">
                        <Shirt size={22} className="text-[#61dafb]" />
                        Cosmetics
                    </h1>
                    <p className="mt-1 text-sm text-gray-500">
                        Upload, edit and disable cosmetics and emotes. A new cosmetic isn't on sale
                        until you price it from Store → Products, but a variant added to a group
                        that's already on sale is sold with it.
                    </p>
                </div>
                {!creating && (
                    <button onClick={() => setCreating(true)} className={primaryButton}>
                        <Plus size={16} />
                        New cosmetic
                    </button>
                )}
            </div>
            {creating ? <CreateWizard onClose={() => setCreating(false)} /> : <CosmeticGrid />}
        </div>
    );
}

/* ---------- Create wizard ---------- */

const STEPS = ["Type", "Details", "Files", "Upload"] as const;

interface Draft extends Picked {
    key: string;
    label: string;
    model: "" | "slim" | "wide";
    variantKey: string;
    reuse: string;
    cover: File | null;
}
const newDraft = (): Draft => ({
    ...NOTHING,
    key: crypto.randomUUID(),
    label: "",
    model: "",
    variantKey: "",
    reuse: "",
    cover: null,
});

type UploadState = "busy" | "done" | Error;

function CreateWizard({ onClose }: { onClose: () => void }) {
    const catalog = useCatalog();
    const [step, setStep] = useState(0);
    const [type, setType] = useState<CosmeticType | null>(null);
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [slots, setSlots] = useState<BodySlot[]>([]);
    const [slotsPicked, setSlotsPicked] = useState(false);
    const [withVariants, setWithVariants] = useState(false);
    const [publishNow, setPublishNow] = useState(false);
    const [drafts, setDrafts] = useState<Draft[]>([newDraft()]);
    const [previewKey, setPreviewKey] = useState(drafts[0].key);
    const [states, setStates] = useState<Record<string, UploadState>>({});
    const [outcomes, setOutcomes] = useState<Record<string, UploadOutcome>>({});
    const [createdIds, setCreatedIds] = useState<Record<string, number>>({});
    const [reports, setReports] = useState<Record<string, ReportState>>({});
    const [coverSeconds, setCoverSeconds] = useState<number | null>(null);
    const [captureProblems, setCaptureProblems] = useState<string[]>([]);
    const [autoCovers, setAutoCovers] = useState<Record<string, AutoCover>>({});
    const [joined, setJoined] = useState<GroupState | null>(null);
    const [groupPublish, setGroupPublish] = useState<UploadState | null>(null);
    const [publishFailed, setPublishFailed] = useState(false);
    const [uploadFailed, setUploadFailed] = useState(false);
    const [afterPublish, setAfterPublish] = useState<GroupState | null | undefined>(undefined);
    const [catalogSince, setCatalogSince] = useState(0);
    const create = useCreateCosmetic();
    const publishGroup = useAdminMutation<number>((id) => ({
        method: "POST",
        path: "/cosmetics/manage/update",
        body: { cosmetic_id: id, enabled: true },
    }));

    const isEmote = type === "emote";
    const isNameplate = type === "nameplate";
    const grouped = withVariants && !isEmote;
    const shownDrafts = grouped ? drafts : drafts.slice(0, 1);
    const allDone = shownDrafts.every((draft) => states[draft.key] === "done");
    const anyDone = shownDrafts.some((draft) => states[draft.key] === "done");
    const groupUnknown = grouped && type !== null && !anyDone && !catalogCheckedSince(catalog, catalogSince);
    // The backend finds groups by name and type, so a taken name adds to it.
    const found = grouped && type && catalog.data ? findUploadGroup(catalog.data, type, name) : null;
    const existingVariants = found?.unit?.variants ?? [];
    const uploading = Object.values(states).includes("busy") || groupPublish === "busy";
    const liveGroup = found ? groupState(found) : null;
    const targetGroup = anyDone ? joined : liveGroup;
    const visibility = uploadVisibility(type ?? "", targetGroup, publishNow);
    const shownGroup = afterPublish === undefined ? targetGroup : afterPublish;
    const saleHint = groupUnknown
        ? "Checking the library to see whether this group is already on sale."
        : grouped && afterPublish === null
          ? UNCHECKED_SALE_HINT
          : uploadSaleHint(
                grouped ? shownGroup : null,
                allDone,
                !shownGroup || shownGroup.enabled || (!allDone && !uploadFailed && visibility.publishGroup),
                allDone && publishFailed,
            );
    const finished = allDone && (!visibility.publishGroup || groupPublish === "done");
    const slotError = type ? validateSlots(type, isEmote ? [] : slots) : null;
    const effectGuess = useMemo(() => {
        if (type !== "effect") return null;
        const ready = shownDrafts.map((draft) => reports[draft.key]);
        if (ready.some((report) => report === null || report === undefined || report === "busy")) return null;
        const checked = ready as FileReport[];
        const readable = checked.every((report) => report.effectContent !== undefined && !report.invalid && report.problems.length === 0);
        return inferEffectSlots(
            readable
                ? {
                      trails: checked.some((report) => report.effectContent?.trails),
                      moments: checked.some((report) => report.effectContent?.moments),
                  }
                : null,
        );
    }, [type, shownDrafts, reports]);
    const guessedSlots = effectGuess ? effectGuess.slots.join(",") : null;
    useEffect(() => {
        if (type !== "effect" || slotsPicked) return;
        setSlots(guessedSlots ? (guessedSlots.split(",") as BodySlot[]) : []);
    }, [type, guessedSlots, slotsPicked]);
    const anyManifest = shownDrafts.some((draft) => reportManifest(reports[draft.key]));
    const coversByUpload = type !== null && coverMode(type, anyManifest) === "upload";

    const onReport = useCallback(
        (key: string, report: ReportState) => setReports((all) => (all[key] === report ? all : { ...all, [key]: report })),
        [],
    );
    const onAutoCover = useCallback(
        (key: string, cover: AutoCover) => setAutoCovers((all) => (all[key] === cover ? all : { ...all, [key]: cover })),
        [],
    );

    const sourceDraft = (draft: Draft) =>
        draft.reuse.startsWith("draft:") ? drafts.find((other) => other.key === draft.reuse.slice(6)) : undefined;
    const sourceCosmetic = (draft: Draft) =>
        draft.reuse.startsWith("cosmetic:")
            ? existingVariants.find((variant) => variant.id === Number(draft.reuse.slice(9)))
            : undefined;
    const bundleKeysFor = (draft: Draft) => reportKeys(reports[sourceDraft(draft)?.key ?? draft.key]);
    const sourceOf = (draft: Draft): PreviewSource | null => {
        const files = sourceDraft(draft)?.files ?? draft.files;
        return files.length ? files : (sourceCosmetic(draft)?.url ?? null);
    };
    const coverNeeded = (draft: Draft) =>
        type !== null && needsDashboardCover(type, reportManifest(reports[sourceDraft(draft)?.key ?? draft.key]));
    const coverRequest = (draft: Draft): CoverRequest | null => {
        const source = sourceOf(draft);
        if (!type || !source || draft.cover || states[draft.key] === "done" || !coverNeeded(draft)) return null;
        return { source, type, variantKey: draft.variantKey.trim() || null };
    };
    const coverFor = (draft: Draft) => draft.cover ?? autoCovers[draft.key]?.file ?? null;
    const makingCovers = shownDrafts.some((draft) => coverRequest(draft) && autoCovers[draft.key]?.busy !== false);

    const draftProblems = (draft: Draft) => {
        const others = shownDrafts.filter((other) => other.key !== draft.key).map((other) => other.variantKey.trim());
        const taken = [...others, ...existingVariants.map((variant) => variant.variant_key)];
        return [
            ...(draft.reuse ? [] : reportProblems(reports[draft.key])),
            ...variantKeyProblems(type ?? "", draft.variantKey, bundleKeysFor(draft), grouped ? taken : []),
        ];
    };

    const stepValid = [
        type !== null,
        name.trim() !== "" && (type === "effect" || slotError === null) && !groupUnknown,
        shownDrafts.every(
            (draft) =>
                (type !== "effect" || slotError === null) &&
                (draft.reuse || draft.files.length > 0) &&
                (!grouped || draft.label.trim()) &&
                reports[draft.key] !== "busy" &&
                (draft.reuse !== "" || !reportInvalid(reports[draft.key])) &&
                draftProblems(draft).length === 0,
        ),
        true,
    ];

    const goTo = (next: number) => {
        if (next === 1 || next === 3) {
            setCatalogSince(Date.now());
            void catalog.refetch();
        }
        setStep(next);
    };

    const patchDraft = (key: string, patch: Partial<Draft>) =>
        setDrafts((all) => all.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)));

    const uploadAll = async () => {
        if (groupUnknown) return;
        const group = targetGroup;
        if (!anyDone) setJoined(liveGroup);
        const plan = uploadVisibility(type!, group, publishNow);
        const baseOrder = existingVariants.length ? Math.max(...existingVariants.map((v) => v.variant_order)) + 1 : 0;
        const created = { ...createdIds };
        for (const [index, draft] of shownDrafts.entries()) {
            if (states[draft.key] === "done") continue;
            setStates((all) => ({ ...all, [draft.key]: "busy" }));
            try {
                let file: NamedBlob | null = null;
                let assetFrom: number | undefined;
                if (draft.reuse.startsWith("draft:")) {
                    assetFrom = created[draft.reuse.slice(6)];
                    if (assetFrom === undefined) throw new Error("The variant it shares a file with hasn't uploaded yet.");
                } else if (draft.reuse.startsWith("cosmetic:")) {
                    assetFrom = Number(draft.reuse.slice(9));
                } else {
                    file = await prepareChecked(type!, draft);
                }
                const cover = coverFor(draft);
                const form = buildCreateForm(
                    {
                        type: type!,
                        name,
                        description,
                        slots: isEmote ? [] : slots,
                        group: grouped ? name : undefined,
                        variantName: draft.label,
                        variantOrder: baseOrder + index,
                        modelVariant: draft.model,
                        variantKey: draft.variantKey,
                        coverSeconds: coverNeeded(draft) ? null : coverSeconds,
                        enabled: plan.enabled,
                        assetFrom,
                    },
                    file,
                    cover ? { blob: cover, name: cover.name } : null,
                );
                const outcome = parseUploadOutcome(await create.mutateAsync(form));
                if (outcome.cosmeticId !== null) created[draft.key] = outcome.cosmeticId;
                setCreatedIds({ ...created });
                setOutcomes((all) => ({ ...all, [draft.key]: outcome }));
                setStates((all) => ({ ...all, [draft.key]: "done" }));
            } catch (error) {
                setStates((all) => ({ ...all, [draft.key]: error as Error }));
                setUploadFailed(true);
                return;
            }
        }
        const publishId = group?.id ?? Object.values(created)[0];
        if (plan.publishGroup && group && publishId !== undefined && groupPublish !== "done") {
            setGroupPublish("busy");
            let result: UploadState;
            try {
                await publishGroup.mutateAsync(publishId);
                result = "done";
            } catch (error) {
                result = error as Error;
            }
            setAfterPublish(groupAfterPublish(await catalog.refetch(), publishId, group, result === "done"));
            setGroupPublish(result);
            setPublishFailed(result !== "done");
        }
    };

    const close = () => {
        const started = drafts.some((draft) => draft.files.length) && !allDone;
        if (!started || confirm("Discard this cosmetic? Nothing that wasn't uploaded is kept.")) onClose();
    };

    const preview = shownDrafts.find((draft) => draft.key === previewKey) ?? shownDrafts[0];
    const previewSource = sourceOf(preview);
    const shownKey = preview.variantKey.trim();
    const previewColorways = reportColorways(reports[sourceDraft(preview)?.key ?? preview.key]);

    const draftSummary = (draft: Draft) => {
        const source = sourceDraft(draft);
        if (source) return `Same file as ${source.label.trim() || "an earlier variant"}`;
        const cosmetic = sourceCosmetic(draft);
        if (cosmetic) return `Same file as ${variantLabel(cosmetic)}`;
        return pickedSummary(draft);
    };

    const reuseOptions = (draft: Draft, index: number) => [
        ...shownDrafts
            .slice(0, index)
            .filter((other) => !other.reuse && other.files.length)
            .map((other) => ({ value: `draft:${other.key}`, label: `Same file as ${other.label.trim() || "an earlier variant"}` })),
        ...existingVariants.map((variant) => ({
            value: `cosmetic:${variant.id}`,
            label: `Same file as ${variantLabel(variant)}`,
        })),
    ].filter((option) => option.value !== `draft:${draft.key}`);

    return (
        <div className="flex flex-col gap-6 rounded-lg bg-gray-800 p-6 shadow-xl">
            <div className="flex items-center justify-between gap-4">
                <ol className="flex flex-wrap items-center gap-2 text-sm">
                    {STEPS.map((label, index) => (
                        <li key={label} className="flex items-center gap-2">
                            {index > 0 && <span className="h-px w-6 bg-gray-600" />}
                            <button
                                type="button"
                                // Only steps already reached can be jumped back to.
                                disabled={index >= step || uploading || allDone}
                                onClick={() => goTo(index)}
                                className={`flex items-center gap-2 rounded-full px-3 py-1 ${
                                    index === step
                                        ? "bg-[#61dafb] font-semibold text-gray-900"
                                        : index < step
                                          ? "bg-gray-700 text-gray-200 hover:bg-gray-600"
                                          : "bg-gray-900 text-gray-500"
                                }`}
                            >
                                {index < step ? <Check size={14} /> : <span>{index + 1}</span>}
                                {label}
                            </button>
                        </li>
                    ))}
                </ol>
                <button onClick={close} title="Cancel" className="text-gray-400 hover:text-gray-100">
                    <X size={20} />
                </button>
            </div>

            {step === 0 && (
                <Step title="What are you making?" hint="Pick a type; the next steps adapt to it.">
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                        {TYPES.map((t) => (
                            <button
                                key={t}
                                onClick={() => {
                                    if (t !== type) {
                                        setSlots(t === "effect" ? [] : DEFAULT_SLOTS[t]);
                                        setSlotsPicked(false);
                                        setDrafts(drafts.map((draft) => ({ ...draft, reuse: "" })));
                                    }
                                    setType(t);
                                    goTo(1);
                                }}
                                className={`rounded-lg border px-4 py-5 text-left capitalize transition ${
                                    t === type
                                        ? "border-[#61dafb] bg-[#61dafb]/10 text-gray-100"
                                        : "border-gray-700 bg-gray-900/40 text-gray-300 hover:border-gray-500"
                                }`}
                            >
                                <div className="font-semibold">{t}</div>
                                <div className="mt-1 text-xs normal-case text-gray-500">{typeHint(t)}</div>
                            </button>
                        ))}
                    </div>
                </Step>
            )}

            {step === 1 && type && (
                <Step title="Name it" hint="Players see the name and description in the store and wardrobe.">
                    <div className="flex max-w-2xl flex-col gap-4">
                        <Field label="Name">
                            <input
                                value={name}
                                onChange={(event) => setName(event.target.value)}
                                placeholder={isNameplate ? "Gold Nameplate" : type === "effect" ? "Spark Trail" : "Pride Cape"}
                                autoFocus
                                className={inputClass}
                            />
                        </Field>
                        <Field label="Description (optional)">
                            <textarea
                                value={description}
                                onChange={(event) => setDescription(event.target.value)}
                                rows={2}
                                className={inputClass}
                            />
                        </Field>
                        {!isEmote && (
                            <>
                                <div className="flex flex-col gap-2 text-sm text-gray-400">
                                    Does it come in variants?
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        <Choice
                                            active={!withVariants}
                                            onClick={() => setWithVariants(false)}
                                            title="No, just one"
                                            hint="A single file."
                                        />
                                        <Choice
                                            active={withVariants}
                                            onClick={() => setWithVariants(true)}
                                            title="Yes, several variants"
                                            hint={
                                                isNameplate
                                                    ? "E.g. colorways from one bundle. Players buy it once and pick a variant."
                                                    : "E.g. colors, or slim/wide arms. Players buy it once and pick a variant."
                                            }
                                        />
                                    </div>
                                </div>
                                {found && (
                                    <p className="rounded border border-sky-800 bg-sky-900/30 px-3 py-2 text-sm text-sky-200">
                                        {existingVariants.length
                                            ? `A ${type} called “${found.group.name}” already has ${existingVariants.length} variant(s). The ones you add here join it.`
                                            : `A ${type} group called “${found.group.name}” already exists. The variants you add here join it.`}
                                    </p>
                                )}
                                {groupUnknown && (
                                    <GroupCheck
                                        type={type}
                                        error={catalog.isError ? catalog.error : null}
                                        retrying={catalog.isFetching}
                                        onRetry={() => void catalog.refetch()}
                                    />
                                )}
                                {type !== "effect" && (
                                    <>
                                        <details className="text-sm text-gray-400">
                                            <summary className="cursor-pointer select-none">
                                                Body slots: {slots.join(", ") || "none"}{" "}
                                                <span className="text-gray-600">(defaults for {type}; change only if needed)</span>
                                            </summary>
                                            <div className="mt-2">
                                                <CheckList
                                                    items={slotItems(type)}
                                                    selected={slots as string[]}
                                                    onChange={(next) => setSlots(next as BodySlot[])}
                                                />
                                            </div>
                                        </details>
                                        {slotError && <p className="text-sm text-red-300">{slotError}</p>}
                                    </>
                                )}
                            </>
                        )}
                        {visibility.hint && !groupUnknown && (
                            <div className="flex flex-col gap-1">
                                {visibility.toggle && (
                                    <Toggle label={visibility.toggle} checked={publishNow} onChange={setPublishNow} />
                                )}
                                <p className="text-xs text-gray-500">{visibility.hint}</p>
                            </div>
                        )}
                    </div>
                </Step>
            )}

            {step === 2 && type && (
                <Step title={grouped ? "Add the variants" : "Pick the file"} hint={fileHint(type)}>
                    <div className="grid gap-6 md:grid-cols-[1fr_320px]">
                        <div className="flex flex-col gap-3">
                            {type === "effect" && (
                                <div className="flex flex-col gap-2 rounded border border-gray-700 bg-gray-900/40 p-3 text-sm text-gray-400">
                                    <span>Body slots: {slots.join(", ") || "none"}</span>
                                    <CheckList
                                        items={slotItems(type)}
                                        selected={slots as string[]}
                                        onChange={(next) => {
                                            setSlotsPicked(true);
                                            setSlots(next as BodySlot[]);
                                        }}
                                    />
                                    {effectGuess === null && <p className="text-xs text-gray-500">Add the file and the slot is picked from what's in it.</p>}
                                    {effectGuess?.hint && !slotsPicked && (
                                        <p className={`text-xs ${effectGuess.needsChoice ? "text-amber-300" : "text-gray-500"}`}>{effectGuess.hint}</p>
                                    )}
                                    {slotError && <p className="text-sm text-red-300">{slotError}</p>}
                                </div>
                            )}
                            {shownDrafts.map((draft, index) => (
                                <DraftCard
                                    key={draft.key}
                                    type={type}
                                    draft={draft}
                                    index={index}
                                    grouped={grouped}
                                    selected={preview.key === draft.key}
                                    removable={grouped && drafts.length > 1}
                                    reuseOptions={isNameplate && grouped ? reuseOptions(draft, index) : []}
                                    bundleKeys={bundleKeysFor(draft)}
                                    suggestions={keySuggestions(bundleKeysFor(draft), reports[sourceDraft(draft)?.key ?? draft.key])}
                                    problems={draftProblems(draft)}
                                    onSelect={() => setPreviewKey(draft.key)}
                                    onPatch={(patch) => patchDraft(draft.key, patch)}
                                    onRemove={() =>
                                        setDrafts(
                                            drafts
                                                .filter((d) => d.key !== draft.key)
                                                .map((d) => (d.reuse === `draft:${draft.key}` ? { ...d, reuse: "" } : d)),
                                        )
                                    }
                                    onReport={onReport}
                                />
                            ))}
                            {grouped && (
                                <button
                                    onClick={() => {
                                        const next = newDraft();
                                        setDrafts([...drafts, next]);
                                        setPreviewKey(next.key);
                                    }}
                                    className={secondaryButton}
                                >
                                    <Plus size={16} />
                                    Add another variant
                                </button>
                            )}
                        </div>
                        <div className="flex flex-col gap-2">
                            <span className="text-sm text-gray-400">
                                Preview{grouped && preview.label ? `: ${preview.label}` : ""}
                            </span>
                            <CosmeticPreview
                                source={previewSource}
                                type={type}
                                bodySlot={slots[0] ?? previewSlot(type)}
                                className="h-96 w-full"
                                frozenAt={coversByUpload ? null : coverSeconds}
                                variantKey={isNameplate ? shownKey || null : null}
                                colorway={shownKey && previewColorways.includes(shownKey) ? shownKey : undefined}
                                onCoverBlob={(blob) =>
                                    void adoptCover(blob, (cover) => patchDraft(preview.key, { cover })).then(setCaptureProblems)
                                }
                            />
                            {captureProblems.length > 0 && <ProblemList problems={captureProblems} />}
                            {coversByUpload ? (
                                <p className="text-xs text-gray-500">
                                    {type === "effect" || isNameplate
                                        ? `The server doesn't make covers for ${type}s,`
                                        : "The server doesn't make covers for bundles with a manifest.json,"}{" "}
                                    so one is made from the preview and shown on the next step. To pick the frame
                                    yourself, press Save as cover under the preview
                                    {grouped ? ` for ${preview.label.trim() || "this variant"}` : ""} or add a PNG.
                                </p>
                            ) : (
                                <FramePicker value={coverSeconds} onChange={setCoverSeconds} />
                            )}
                        </div>
                    </div>
                </Step>
            )}

            {step === 3 && type && (
                <Step
                    title={allDone ? "Uploaded" : "Review and upload"}
                    hint={saleHint}
                >
                    <div className="flex max-w-2xl flex-col gap-4">
                        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 text-sm">
                            <dt className="text-gray-500">Type</dt>
                            <dd className="capitalize text-gray-200">{type}</dd>
                            <dt className="text-gray-500">Name</dt>
                            <dd className="text-gray-200">{name.trim()}</dd>
                            {!isEmote && (
                                <>
                                    <dt className="text-gray-500">Slots</dt>
                                    <dd className="text-gray-200">{slots.join(", ")}</dd>
                                </>
                            )}
                            {visibility.summary && (
                                <>
                                    <dt className="text-gray-500">Visibility</dt>
                                    <dd className="text-gray-200">{visibility.summary}</dd>
                                </>
                            )}
                        </dl>
                        <ul className="flex flex-col divide-y divide-gray-700 rounded-lg border border-gray-700">
                            {shownDrafts.map((draft) => (
                                <ReviewRow
                                    key={draft.key}
                                    draft={draft}
                                    title={grouped ? draft.label : name.trim()}
                                    summary={draftSummary(draft)}
                                    state={states[draft.key]}
                                    outcome={outcomes[draft.key] ?? null}
                                    showCover={states[draft.key] !== "done" && (coverNeeded(draft) || draft.cover !== null)}
                                    request={coverRequest(draft)}
                                    onAutoCover={onAutoCover}
                                    onCover={(cover) => patchDraft(draft.key, { cover })}
                                />
                            ))}
                        </ul>
                        {groupUnknown && (
                            <GroupCheck
                                type={type}
                                error={catalog.isError ? catalog.error : null}
                                retrying={catalog.isFetching}
                                onRetry={() => void catalog.refetch()}
                            />
                        )}
                        {allDone && groupPublish instanceof Error && (
                            <div className="flex flex-col gap-2">
                                <p className="text-sm text-amber-300">{publishProblem(afterPublish ?? null)}</p>
                                <ProblemBanner error={groupPublish} />
                            </div>
                        )}
                        {finished ? (
                            <button onClick={onClose} className={primaryButton}>
                                <Check size={16} />
                                Back to the library
                            </button>
                        ) : (
                            <button onClick={uploadAll} disabled={uploading || makingCovers || groupUnknown} className={primaryButton}>
                                <Upload size={16} />
                                {uploading
                                    ? "Uploading…"
                                    : allDone
                                      ? afterPublish?.enabled
                                        ? "Try the store update again"
                                        : "Make the group live"
                                      : makingCovers
                                      ? "Making covers…"
                                      : Object.keys(states).length
                                      ? "Retry the rest"
                                      : `Upload ${shownDrafts.length > 1 ? `${shownDrafts.length} variants` : isEmote ? "emote" : "cosmetic"}`}
                            </button>
                        )}
                    </div>
                </Step>
            )}

            {step > 0 && step < 3 && (
                <div className="flex justify-between border-t border-gray-700 pt-4">
                    <button onClick={() => goTo(step - 1)} className={secondaryButton}>
                        <ArrowLeft size={16} />
                        Back
                    </button>
                    <button onClick={() => goTo(step + 1)} disabled={!stepValid[step]} className={primaryButton}>
                        Next
                        <ArrowRight size={16} />
                    </button>
                </div>
            )}
        </div>
    );
}

function GroupCheck({
    type,
    error,
    retrying,
    onRetry,
}: {
    type: string;
    error: unknown;
    retrying: boolean;
    onRetry: () => void;
}) {
    if (!error) {
        return (
            <p className="text-sm text-gray-400">
                Checking the library for an existing {type} with this name…
            </p>
        );
    }
    return (
        <div className="flex flex-col gap-2 rounded border border-red-700 bg-red-900/40 px-3 py-2 text-sm text-red-200">
            <p>
                The library didn't load, so we can't check whether a {type} with this name already exists. If it
                does, these variants join it and go on sale with it. Try again to continue.
            </p>
            <p className="text-xs text-red-300">{(error as Error).message}</p>
            <button type="button" onClick={onRetry} disabled={retrying} className={`${secondaryButton} self-start`}>
                <RefreshCw size={14} />
                {retrying ? "Retrying…" : "Retry"}
            </button>
        </div>
    );
}

function ReviewRow({
    draft,
    title,
    summary,
    state,
    outcome,
    showCover,
    request,
    onAutoCover,
    onCover,
}: {
    draft: Draft;
    title: string;
    summary: string;
    state: UploadState | undefined;
    outcome: UploadOutcome | null;
    showCover: boolean;
    request: CoverRequest | null;
    onAutoCover: (key: string, cover: AutoCover) => void;
    onCover: (cover: File | null) => void;
}) {
    const auto = useAutoCover(request);
    useEffect(() => onAutoCover(draft.key, auto), [draft.key, auto, onAutoCover]);

    return (
        <li className="flex flex-col gap-2 px-4 py-3 text-sm">
            <div className="flex items-center gap-3">
                <span className="text-gray-200">{title}</span>
                {draft.model && <Badge>{draft.model}</Badge>}
                {draft.variantKey.trim() && <Badge tone="blue">{draft.variantKey.trim()}</Badge>}
                <span className="truncate text-xs text-gray-500">{summary}</span>
                <span className="ml-auto shrink-0">
                    {state === "done" ? (
                        <Badge tone="green">uploaded</Badge>
                    ) : state === "busy" ? (
                        <Badge tone="blue">uploading…</Badge>
                    ) : state instanceof Error ? (
                        <Badge tone="red">failed</Badge>
                    ) : (
                        <Badge>ready</Badge>
                    )}
                </span>
            </div>
            {showCover && <AutoCoverPicker manual={draft.cover} auto={auto} onChange={onCover} />}
            {state instanceof Error && <ProblemBanner error={state} />}
            <OutcomeNotes outcome={outcome} />
        </li>
    );
}

function AutoCoverPicker({
    manual,
    auto,
    onChange,
}: {
    manual: File | null;
    auto: AutoCover;
    onChange: (file: File | null) => void;
}) {
    return (
        <div className="flex flex-col gap-1">
            <CoverPicker
                file={manual ?? auto.file}
                auto={!manual && auto.file !== null}
                pending={!manual && auto.busy}
                onChange={onChange}
                optional
            />
            {!manual && auto.error && (
                <p className="text-xs text-amber-300">
                    Couldn't make a cover from the preview ({auto.error}). Add one yourself, or upload without one.
                </p>
            )}
        </div>
    );
}

function DraftCard({
    type,
    draft,
    index,
    grouped,
    selected,
    removable,
    reuseOptions,
    bundleKeys,
    suggestions,
    problems,
    onSelect,
    onPatch,
    onRemove,
    onReport,
}: {
    type: CosmeticType;
    draft: Draft;
    index: number;
    grouped: boolean;
    selected: boolean;
    removable: boolean;
    reuseOptions: { value: string; label: string }[];
    bundleKeys: string[];
    suggestions: string[];
    problems: string[];
    onSelect: () => void;
    onPatch: (patch: Partial<Draft>) => void;
    onRemove: () => void;
    onReport: (key: string, report: ReportState) => void;
}) {
    const report = useBundleReport(type, draft.reuse ? NOTHING : draft);
    useEffect(() => onReport(draft.key, report), [draft.key, report, onReport]);
    const skinned = type !== "nameplate" && type !== "effect";

    return (
        <div
            onFocusCapture={onSelect}
            onClick={onSelect}
            className={`flex flex-col gap-3 rounded-lg border p-4 ${selected ? "border-[#61dafb]/60" : "border-gray-700"}`}
        >
            {(grouped || needsVariantKey(type, grouped)) && (
                <div className="flex flex-wrap items-end gap-3">
                    {grouped && (
                        <Field label={`Variant ${index + 1} label`}>
                            <input
                                value={draft.label}
                                onChange={(event) => onPatch({ label: event.target.value })}
                                placeholder={["Red", "Blue", "Green"][index % 3]}
                                className={inputClass}
                            />
                        </Field>
                    )}
                    {needsVariantKey(type, grouped) && (
                        <VariantKeyField
                            type={type}
                            value={draft.variantKey}
                            onChange={(variantKey) => onPatch({ variantKey })}
                            suggestions={suggestions}
                        />
                    )}
                    {grouped && skinned && (
                        <Field label="Skin model">
                            <select
                                value={draft.model}
                                onChange={(event) => onPatch({ model: event.target.value as Draft["model"] })}
                                className={inputClass}
                            >
                                <option value="">Any</option>
                                <option value="slim">Slim only</option>
                                <option value="wide">Wide only</option>
                            </select>
                        </Field>
                    )}
                    {removable && (
                        <button onClick={onRemove} title="Remove variant" className="mb-2 text-gray-500 hover:text-red-300">
                            <Trash2 size={16} />
                        </button>
                    )}
                </div>
            )}
            {reuseOptions.length > 0 && (
                <Field label="File">
                    <select
                        value={draft.reuse}
                        onChange={(event) => onPatch({ reuse: event.target.value })}
                        className={inputClass}
                    >
                        <option value="">Its own file</option>
                        {reuseOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                </Field>
            )}
            {!draft.reuse && <FilePicker picked={draft} onChange={(picked) => onPatch(picked)} />}
            <BundleNotes report={draft.reuse ? null : report} problems={problems} keys={draft.reuse ? [] : bundleKeys} />
            <CoverPicker file={draft.cover} onChange={(cover) => onPatch({ cover })} optional />
        </div>
    );
}

function Step({ title, hint, children }: { title: string; hint: string; children: ReactNode }) {
    return (
        <div className="flex flex-col gap-4">
            <div>
                <h2 className="text-lg font-bold text-gray-100">{title}</h2>
                <p className="text-sm text-gray-500">{hint}</p>
            </div>
            {children}
        </div>
    );
}

function Choice({ active, onClick, title, hint }: { active: boolean; onClick: () => void; title: string; hint: string }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`rounded-lg border px-4 py-3 text-left ${
                active ? "border-[#61dafb] bg-[#61dafb]/10" : "border-gray-700 bg-gray-900/40 hover:border-gray-500"
            }`}
        >
            <div className="font-semibold text-gray-100">{title}</div>
            <div className="mt-1 text-xs text-gray-500">{hint}</div>
        </button>
    );
}

function pickedSummary({ files, folder }: Picked): string {
    if (!files.length) return "No file chosen";
    if (!folder) return files[0].name;
    const count = files.filter((file) => !isJunkPath(relativePath(file))).length;
    return `${relativePath(files[0]).split("/")[0]}/ — ${count} file(s), zipped on upload`;
}

/** One file or a whole folder; the folder is zipped before it is sent. */
function FilePicker({ picked, onChange }: { picked: Picked; onChange: (picked: Picked) => void }) {
    const file = useRef<HTMLInputElement>(null);
    const folder = useRef<HTMLInputElement>(null);
    const pick = (event: React.ChangeEvent<HTMLInputElement>, isFolder: boolean) => {
        const files = Array.from(event.target.files ?? []);
        // Cleared so picking the same thing again still fires.
        event.target.value = "";
        if (files.length) onChange({ files: isFolder ? files : files.slice(0, 1), folder: isFolder });
    };

    return (
        <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => file.current?.click()} className={secondaryButton}>
                <FileUp size={16} />
                Choose file
            </button>
            <button type="button" onClick={() => folder.current?.click()} className={secondaryButton}>
                <FolderUp size={16} />
                Choose folder
            </button>
            <span className={`truncate text-sm ${picked.files.length ? "text-gray-200" : "text-gray-500"}`}>
                {pickedSummary(picked)}
            </span>
            <input ref={file} type="file" hidden onChange={(event) => pick(event, false)} />
            <input
                ref={(el) => {
                    folder.current = el;
                    el?.setAttribute("webkitdirectory", "");
                }}
                type="file"
                multiple
                hidden
                onChange={(event) => pick(event, true)}
            />
        </div>
    );
}

function useObjectUrl(file: File | null): string | null {
    const [url, setUrl] = useState<string | null>(null);
    useEffect(() => {
        if (!file) {
            setUrl(null);
            return;
        }
        const next = URL.createObjectURL(file);
        setUrl(next);
        return () => URL.revokeObjectURL(next);
    }, [file]);
    return url;
}

function CoverPicker({
    file,
    onChange,
    optional = false,
    auto = false,
    pending = false,
}: {
    file: File | null;
    onChange: (file: File | null) => void;
    optional?: boolean;
    auto?: boolean;
    pending?: boolean;
}) {
    const input = useRef<HTMLInputElement>(null);
    const [checking, setChecking] = useState(false);
    const [problems, setProblems] = useState<string[]>([]);
    const thumb = useObjectUrl(file);

    const pick = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const picked = event.target.files?.[0];
        event.target.value = "";
        if (!picked) return;
        setChecking(true);
        const found = await checkCover(picked);
        setChecking(false);
        setProblems(found);
        onChange(found.length ? null : picked);
    };

    return (
        <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-center gap-3">
                <button type="button" onClick={() => input.current?.click()} className={secondaryButton}>
                    <ImagePlus size={16} />
                    {auto ? "Replace cover" : file ? "Change cover" : optional ? "Add a cover" : "Choose cover"}
                </button>
                {thumb && <img src={thumb} alt="" className="h-10 w-10 rounded bg-gray-900 object-contain" />}
                <span className={`truncate text-sm ${file ? "text-gray-200" : "text-gray-500"}`}>
                    {checking
                        ? "Checking…"
                        : auto
                          ? "Made from the preview"
                          : file
                            ? file.name
                            : pending
                              ? "Making one from the preview…"
                              : "No cover chosen"}
                </span>
                {file && !auto && (
                    <button
                        type="button"
                        onClick={() => onChange(null)}
                        title="Remove cover"
                        className="text-gray-500 hover:text-red-300"
                    >
                        <X size={14} />
                    </button>
                )}
                <input ref={input} type="file" accept="image/png" hidden onChange={(event) => void pick(event)} />
            </div>
            {problems.length > 0 && <ProblemList problems={problems} />}
            <span className="text-xs text-gray-600">
                PNG, up to {formatBytes(MAX_COVER_BYTES)} and {MAX_COVER_SIDE}×{MAX_COVER_SIDE}.
            </span>
        </div>
    );
}

function VariantKeyField({
    type,
    value,
    onChange,
    suggestions,
    unknown = false,
}: {
    type: string;
    value: string;
    onChange: (value: string) => void;
    suggestions: string[];
    unknown?: boolean;
}) {
    const listId = useId();
    const help = unknown
        ? "The catalogue doesn't list this variant's key. Leave it empty to keep it."
        : type === "nameplate"
          ? "Must be a variant in the bundle's manifest, or “default” if the manifest lists no variants."
          : "Optional. Unique in the group, so sets can ask for this exact variant.";

    return (
        <Field label="Variant key" help={help}>
            <input
                value={value}
                onChange={(event) => onChange(event.target.value)}
                list={suggestions.length ? listId : undefined}
                placeholder={suggestions[0] ?? (type === "nameplate" ? "default" : "gold")}
                className={`${inputClass} font-mono`}
            />
            {suggestions.length > 0 && (
                <datalist id={listId}>
                    {suggestions.map((suggestion) => (
                        <option key={suggestion} value={suggestion} />
                    ))}
                </datalist>
            )}
        </Field>
    );
}

function BundleNotes({ report, problems, keys }: { report: ReportState; problems: string[]; keys: string[] }) {
    const checked = report && report !== "busy" ? report : null;
    return (
        <>
            {report === "busy" && <p className="text-xs text-gray-500">Checking the files…</p>}
            {problems.length > 0 && <ProblemList problems={problems} />}
            {checked?.invalid && (
                <p className="text-sm text-red-300">This bundle can't be uploaded until the errors below are fixed.</p>
            )}
            {checked && <IssueList issues={checked.issues} />}
            {checked?.unchecked && (
                <p className="text-xs text-gray-500">The bundle checker didn't load, so only the size and manifest were checked.</p>
            )}
            {keys.length > 0 && (
                <p className="text-xs text-gray-500">
                    Variants in this bundle: <span className="font-mono">{keys.join(", ")}</span>
                </p>
            )}
        </>
    );
}

function ProblemList({ problems }: { problems: string[] }) {
    return (
        <ul className="list-disc pl-5 text-sm text-red-300">
            {problems.map((problem) => (
                <li key={problem}>{problem}</li>
            ))}
        </ul>
    );
}

/* ---------- Library grid ---------- */

function CosmeticGrid() {
    const catalog = useCatalog();
    const units = useMemo(() => cosmeticUnits(catalog.data), [catalog.data]);
    const [typeFilter, setTypeFilter] = useState("all");
    const [search, setSearch] = useState("");
    const [showDisabled, setShowDisabled] = useState(false);
    const [editing, setEditing] = useState<string | null>(null);

    const needle = search.trim().toLowerCase();
    const disabledCount = units.filter((unit) => !unit.enabled).length;
    const shown = units.filter(
        (unit) =>
            (showDisabled || unit.enabled) &&
            (typeFilter === "all" || unit.type === typeFilter) &&
            (!needle ||
                `${unit.name} ${unit.variants.map((v) => `${v.id} ${v.variant_key ?? ""}`).join(" ")}`
                    .toLowerCase()
                    .includes(needle)),
    );
    // Looked up from all units so disabling one doesn't close its editor.
    const editingUnit = units.find((unit) => unit.key === editing);

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
                <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search name, ID or key…"
                    className={`${inputClass} min-w-60 flex-1`}
                />
                <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className={inputClass}>
                    <option value="all">All types</option>
                    {TYPES.map((t) => (
                        <option key={t} value={t}>
                            {t}
                        </option>
                    ))}
                </select>
                <button
                    onClick={() => setShowDisabled(!showDisabled)}
                    aria-pressed={showDisabled}
                    className={`${secondaryButton} py-2 ${showDisabled ? "border-[#61dafb] text-gray-100" : ""}`}
                >
                    {showDisabled ? <Eye size={16} /> : <EyeOff size={16} />}
                    {showDisabled ? "Showing" : "Hiding"} disabled ({disabledCount})
                </button>
            </div>

            <ErrorBanner error={catalog.error} />
            {catalog.isPending && <p className="text-sm text-gray-500">Loading the catalogue…</p>}
            {!catalog.isPending && !shown.length && (
                <p className="text-sm text-gray-500">
                    {units.length ? "Nothing matches these filters." : "No cosmetics yet — create one above."}
                </p>
            )}

            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                {shown.map((unit) => (
                    <button
                        key={unit.key}
                        onClick={() => setEditing(unit.key)}
                        className={`flex flex-col overflow-hidden rounded-lg border border-gray-700 bg-gray-800 text-left shadow-xl transition hover:border-[#61dafb]/60 ${
                            unit.enabled ? "" : "opacity-60"
                        }`}
                    >
                        <div className="group relative aspect-square bg-gray-900">
                            {unit.cover_url && (
                                <img src={unit.cover_url} alt="" loading="lazy" className="h-full w-full object-contain" />
                            )}
                            {unit.preview_url && (
                                <img
                                    src={unit.preview_url}
                                    alt=""
                                    loading="lazy"
                                    className="absolute inset-0 hidden h-full w-full object-contain group-hover:block"
                                />
                            )}
                        </div>
                        <div className="flex flex-col gap-1 p-3">
                            <div className="truncate font-semibold text-gray-100">{unit.name}</div>
                            <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
                                <span className="capitalize">{unit.type}</span>
                                {unit.variants.length > 1 && <span>· {unit.variants.length} variants</span>}
                                <span>· {unit.store_product_id ? formatPrice(unit.base_price) : "not sold"}</span>
                            </div>
                            {!unit.enabled && (
                                <div>
                                    <Badge tone="amber">{unit.type === "nameplate" ? "hidden" : "disabled"}</Badge>
                                </div>
                            )}
                        </div>
                    </button>
                ))}
            </div>

            {editingUnit && (
                <Modal onClose={() => setEditing(null)}>
                    <CosmeticEditor key={editingUnit.key} unit={editingUnit} onClose={() => setEditing(null)} />
                </Modal>
            )}
        </div>
    );
}

/** A native modal dialog: Esc and a backdrop click close it. */
function Modal({ onClose, children }: { onClose: () => void; children: ReactNode }) {
    const ref = useRef<HTMLDialogElement>(null);
    useEffect(() => ref.current?.showModal(), []);

    return (
        <dialog
            ref={ref}
            onClose={onClose}
            onClick={(event) => event.target === ref.current && onClose()}
            className="m-auto max-h-[90vh] w-full max-w-5xl rounded-lg bg-gray-800 text-gray-300 shadow-2xl backdrop:bg-black/70"
        >
            <div className="p-6">{children}</div>
        </dialog>
    );
}

function CosmeticEditor({ unit, onClose }: { unit: CosmeticUnit; onClose: () => void }) {
    const setEnabled = useAdminMutation<boolean>((enabled) => ({
        method: "POST",
        path: "/cosmetics/manage/update",
        body: { cosmetic_id: unit.first.id, enabled },
    }));
    const hiddenNameplate = unit.type === "nameplate" && !unit.enabled;

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-xl font-bold text-gray-100">{unit.name}</h2>
                <span className="font-mono text-xs text-gray-500">#{unit.first.id}</span>
                <Badge>{unit.type}</Badge>
                <Badge tone={unit.enabled ? "green" : "amber"}>
                    {unit.enabled ? "enabled" : hiddenNameplate ? "hidden" : "disabled"}
                </Badge>
                <div className="ml-auto flex items-center gap-3">
                    <button
                        onClick={() => {
                            if (!unit.enabled || confirm(`Disable "${unit.name}"? It leaves the store and the client; owners keep it and it can be re-enabled.`)) {
                                setEnabled.mutate(!unit.enabled);
                            }
                        }}
                        disabled={setEnabled.isPending}
                        className={secondaryButton}
                    >
                        {unit.enabled ? <EyeOff size={16} /> : <Eye size={16} />}
                        {unit.enabled ? "Disable" : "Enable"}
                    </button>
                    <button onClick={onClose} title="Close" className="text-gray-400 hover:text-gray-100">
                        <X size={20} />
                    </button>
                </div>
            </div>
            {hiddenNameplate && (
                <p className="rounded border border-amber-800 bg-amber-900/30 px-3 py-2 text-sm text-amber-200">
                    This nameplate is hidden, so players can't find it. Anyone who already owns it can still equip it.
                </p>
            )}
            <ErrorBanner error={setEnabled.error} />
            <div className="grid gap-6 md:grid-cols-[1fr_320px]">
                <div className="flex flex-col gap-6">
                    <DetailsForm unit={unit} />
                    <VariantsEditor unit={unit} />
                    {unit.group_id !== null && <AddVariantForm unit={unit} />}
                </div>
                <div>
                    <UnitPreview unit={unit} />
                </div>
            </div>
        </div>
    );
}

function groupSlots(unit: CosmeticUnit): string[] {
    if (unit.variants.every((variant) => variant.slots !== undefined)) {
        const union = [...new Set(unit.variants.flatMap((variant) => variant.slots ?? []))];
        if (union.length || unit.type === "emote") return union;
    }
    return DEFAULT_SLOTS[unit.type as CosmeticType] ?? [];
}

/** Uploads one more variant into an existing group. */
function AddVariantForm({ unit }: { unit: CosmeticUnit }) {
    const [label, setLabel] = useState("");
    const [model, setModel] = useState("");
    const [variantKey, setVariantKey] = useState("");
    const [reuse, setReuse] = useState("");
    const [cover, setCover] = useState<File | null>(null);
    const [picked, setPicked] = useState<Picked>(NOTHING);
    const [outcome, setOutcome] = useState<UploadOutcome | null>(null);
    const [localError, setLocalError] = useState<Error | null>(null);
    const create = useCreateCosmetic();
    const isNameplate = unit.type === "nameplate";
    const skinned = !isNameplate && unit.type !== "effect";
    const report = useBundleReport(unit.type, reuse ? NOTHING : picked);
    const problems = [
        ...(reuse ? [] : reportProblems(report)),
        ...variantKeyProblems(
            unit.type,
            variantKey,
            reportKeys(report),
            unit.variants.map((variant) => variant.variant_key),
        ),
    ];
    const needsCover = needsDashboardCover(unit.type, !reuse && reportManifest(report));
    const fileReady = reuse
        ? true
        : picked.files.length > 0 && report !== null && report !== "busy" && !reportInvalid(report);
    const coverSource = reuse ? (unit.variants.find((variant) => variant.id === Number(reuse))?.url ?? null) : picked.files;
    const auto = useAutoCover(
        needsCover && !cover && fileReady && problems.length === 0 && coverSource
            ? { source: coverSource, type: unit.type, variantKey: variantKey.trim() || null }
            : null,
    );
    const sentCover = cover ?? auto.file;

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        setLocalError(null);
        try {
            const file = reuse ? null : await prepareChecked(unit.type, picked);
            const form = buildCreateForm(
                {
                    type: unit.type,
                    name: unit.name,
                    group: unit.name,
                    variantName: label,
                    variantOrder: Math.max(...unit.variants.map((v) => v.variant_order)) + 1,
                    modelVariant: model,
                    variantKey,
                    assetFrom: reuse ? Number(reuse) : undefined,
                    slots: groupSlots(unit),
                },
                file,
                sentCover ? { blob: sentCover, name: sentCover.name } : null,
            );
            create.mutate(form, {
                onSuccess: (data) => {
                    setOutcome(parseUploadOutcome(data));
                    setLabel("");
                    setModel("");
                    setVariantKey("");
                    setReuse("");
                    setCover(null);
                    setPicked(NOTHING);
                },
            });
        } catch (error) {
            setLocalError(error as Error);
        }
    };

    return (
        <form onSubmit={submit} className="flex flex-col gap-3 rounded border border-dashed border-gray-600 p-3">
            <div className="font-semibold text-gray-300">Add a variant</div>
            <div className="flex flex-wrap gap-3">
                <Field label="Variant label">
                    <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Green" className={inputClass} />
                </Field>
                <VariantKeyField
                    type={unit.type}
                    value={variantKey}
                    onChange={setVariantKey}
                    suggestions={keySuggestions(reportKeys(report), report)}
                />
                {skinned && (
                    <Field label="Skin model">
                        <select value={model} onChange={(event) => setModel(event.target.value)} className={inputClass}>
                            <option value="">Any</option>
                            <option value="slim">Slim only</option>
                            <option value="wide">Wide only</option>
                        </select>
                    </Field>
                )}
            </div>
            {isNameplate && (
                <Field label="File" help="Variants that share a file each pick a different variant from its manifest.">
                    <select value={reuse} onChange={(event) => setReuse(event.target.value)} className={inputClass}>
                        <option value="">Upload a new file</option>
                        {unit.variants.map((variant) => (
                            <option key={variant.id} value={variant.id}>
                                Same file as {variantLabel(variant)}
                            </option>
                        ))}
                    </select>
                </Field>
            )}
            {!reuse && <FilePicker picked={picked} onChange={setPicked} />}
            <BundleNotes report={reuse ? null : report} problems={problems} keys={reportKeys(report)} />
            {needsCover ? (
                <AutoCoverPicker manual={cover} auto={auto} onChange={setCover} />
            ) : (
                <CoverPicker file={cover} onChange={setCover} optional />
            )}
            <ProblemBanner error={localError ?? create.error} />
            {create.isSuccess && <p className="text-sm text-green-300">Variant added.</p>}
            <OutcomeNotes outcome={outcome} />
            <button
                type="submit"
                disabled={
                    !label.trim() ||
                    (!reuse && !picked.files.length) ||
                    report === "busy" ||
                    (!reuse && reportInvalid(report)) ||
                    problems.length > 0 ||
                    auto.busy ||
                    create.isPending
                }
                className={secondaryButton}
            >
                <Upload size={16} />
                {create.isPending ? "Uploading…" : auto.busy ? "Making a cover…" : "Upload variant"}
            </button>
        </form>
    );
}

function UnitPreview({ unit }: { unit: CosmeticUnit }) {
    const [variantId, setVariantId] = useState(unit.first.id);
    const variant = unit.variants.find((v) => v.id === variantId) ?? unit.first;
    const [coverSeconds, setCoverSeconds] = useState<number | null>(null);
    const [colorways, setColorways] = useState<string[]>([]);
    const [captured, setCaptured] = useState<{ id: number; file: File } | null>(null);
    const [captureProblems, setCaptureProblems] = useState<string[]>([]);
    const renders = coverMode(unit.type) === "render";
    const key = variant.variant_key ?? null;
    const makeCover = useCoverMaker();
    const [remake, setRemake] = useState<{ id: number; state: "busy" | CoverMade | Error } | null>(null);
    const remakeState = remake?.id === variant.id ? remake.state : null;
    const regenerate = () => {
        const id = variant.id;
        setRemake({ id, state: "busy" });
        makeCover(variant, renders ? coverSeconds : null).then(
            (made) => setRemake({ id, state: made }),
            (error: Error) => setRemake({ id, state: error }),
        );
    };

    return (
        <div className="flex flex-col gap-2">
            {unit.variants.length > 1 ? (
                <select value={variant.id} onChange={(event) => setVariantId(Number(event.target.value))} className={inputClass}>
                    {unit.variants.map((v) => (
                        <option key={v.id} value={v.id}>
                            {v.variant_name ?? `#${v.id}`}
                            {v.model_variant ? ` (${v.model_variant})` : ""}
                            {v.variant_key ? ` · ${v.variant_key}` : ""}
                        </option>
                    ))}
                </select>
            ) : (
                <span className="text-sm text-gray-400">Preview</span>
            )}
            <CosmeticPreview
                source={variant.url}
                type={unit.type}
                bodySlot={variant.slots?.[0] ?? previewSlot(unit.type)}
                frozenAt={renders ? coverSeconds : null}
                variantKey={unit.type === "nameplate" ? key : null}
                colorway={key && colorways.includes(key) ? key : undefined}
                coverUrl={variant.cover_url}
                onInfo={(info) => setColorways(info.colorways ?? [])}
                onCoverBlob={(blob) =>
                    void adoptCover(blob, (file) => setCaptured({ id: variant.id, file })).then(setCaptureProblems)
                }
            />
            {captureProblems.length > 0 && <ProblemList problems={captureProblems} />}

            <div className="mt-4 font-semibold text-gray-300">Cover</div>
            <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
                <figure className="flex flex-col gap-1">
                    <div className="aspect-square rounded bg-gray-900">
                        {variant.cover_url && (
                            <img src={variant.cover_url} alt="Cover" className="h-full w-full object-contain" />
                        )}
                    </div>
                    <figcaption>{variant.cover_url ? "Cover" : "No cover"}</figcaption>
                </figure>
                <figure className="flex flex-col gap-1">
                    <div className="aspect-square rounded bg-gray-900">
                        {variant.preview_url && (
                            <img src={variant.preview_url} alt="Animated preview" className="h-full w-full object-contain" />
                        )}
                    </div>
                    <figcaption>{variant.preview_url ? "Animated preview" : "Doesn't move"}</figcaption>
                </figure>
            </div>
            {renders && <FramePicker value={coverSeconds} onChange={setCoverSeconds} />}
            {remakeState instanceof Error && <ProblemBanner error={remakeState} />}
            {remakeState === "server" && <p className="text-sm text-green-300">Cover re-rendered.</p>}
            {remakeState === "dashboard" && <p className="text-sm text-green-300">Cover made from the preview and uploaded.</p>}
            <button onClick={regenerate} disabled={remakeState === "busy"} className={secondaryButton}>
                <RefreshCw size={16} className={remakeState === "busy" ? "animate-spin" : ""} />
                {remakeState === "busy" ? "Making the cover…" : "Regenerate cover"}
            </button>
            <span className="text-xs text-gray-600">
                {renders
                    ? "Bundles with a manifest.json get their cover made here from the preview, at a set frame."
                    : `The server doesn't make ${unit.type} covers, so this makes one from the preview.`}{" "}
                To use the frame you see, press Save as cover under the preview, or pick a PNG below.
            </span>
            <CoverUpload
                key={variant.id}
                cosmeticId={variant.id}
                hasPreview={variant.preview_url !== null}
                cover={captured?.id === variant.id ? captured.file : null}
                onCoverChange={(file) => setCaptured(file ? { id: variant.id, file } : null)}
            />
        </div>
    );
}

function CoverUpload({
    cosmeticId,
    hasPreview,
    cover,
    onCoverChange,
}: {
    cosmeticId: number;
    hasPreview: boolean;
    cover: File | null;
    onCoverChange: (file: File | null) => void;
}) {
    const [clearPreview, setClearPreview] = useState(false);
    const upload = useCoverUpload();

    return (
        <div className="mt-2 flex flex-col gap-2 border-t border-gray-700 pt-3">
            <CoverPicker file={cover} onChange={onCoverChange} />
            {hasPreview && (
                <Toggle label="Also remove the animated preview" checked={clearPreview} onChange={setClearPreview} />
            )}
            <ProblemBanner error={upload.error} />
            {upload.isSuccess && <p className="text-sm text-green-300">Cover uploaded.</p>}
            <button
                onClick={() => cover && upload.mutate({ id: cosmeticId, file: cover, clearPreview }, { onSuccess: () => onCoverChange(null) })}
                disabled={!cover || upload.isPending}
                className={secondaryButton}
            >
                <ImageUp size={16} />
                {upload.isPending ? "Uploading…" : "Upload cover"}
            </button>
        </div>
    );
}

/** Seconds into the animation the cover is captured at; holds the live preview there. */
function FramePicker({ value, onChange }: { value: number | null; onChange: (value: number | null) => void }) {
    return (
        <div className="flex flex-col gap-1 text-sm text-gray-400">
            <label className="flex items-center gap-2">
                <input
                    type="checkbox"
                    checked={value !== null}
                    onChange={(event) => onChange(event.target.checked ? 1 : null)}
                    className="accent-[#61dafb]"
                />
                Pick the cover frame
            </label>
            {value !== null && (
                <div className="flex items-center gap-2">
                    <input
                        type="range"
                        min={0}
                        max={8}
                        step={0.05}
                        value={value}
                        onChange={(event) => onChange(Number(event.target.value))}
                        className="flex-1 accent-[#61dafb]"
                    />
                    <span className="w-12 text-right font-mono text-xs">{value.toFixed(2)}s</span>
                </div>
            )}
            <span className="text-xs text-gray-600">
                For emotes and animated cosmetics. Without it the cover is taken 1s in.
            </span>
        </div>
    );
}

/** Group-wide fields; price, collection and listing live in Store → Products. */
function DetailsForm({ unit }: { unit: CosmeticUnit }) {
    const [name, setName] = useState(unit.name);
    const [description, setDescription] = useState(unit.description ?? "");

    const body = {
        cosmetic_id: unit.first.id,
        ...(name !== unit.name && { name }),
        ...(description !== (unit.description ?? "") && { description: description.trim() || null }),
    };
    const save = useAdminMutation<void>(() => ({
        method: "POST",
        path: "/cosmetics/manage/update",
        body,
    }));

    return (
        <form
            onSubmit={(event) => {
                event.preventDefault();
                save.mutate();
            }}
            className="flex flex-col gap-3"
        >
            <div className="font-semibold text-gray-300">Details</div>
            <Field label="Name">
                <input value={name} onChange={(event) => setName(event.target.value)} required className={inputClass} />
            </Field>
            <Field label="Description">
                <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={2} className={inputClass} />
            </Field>
            <ErrorBanner error={save.error} />
            {save.isSuccess && <p className="text-sm text-green-300">Saved.</p>}
            <button type="submit" disabled={Object.keys(body).length === 1 || save.isPending} className={secondaryButton}>
                <Save size={16} />
                {save.isPending ? "Saving…" : "Save details"}
            </button>
        </form>
    );
}

/** Per-variant fields and files; group-wide ones live in Details above. */
function VariantsEditor({ unit }: { unit: CosmeticUnit }) {
    return (
        <div className="flex flex-col gap-3">
            <div className="font-semibold text-gray-300">
                {unit.variants.length > 1 ? "Variants" : "File & slots"}
            </div>
            {unit.variants.map((variant) => (
                <VariantForm
                    key={variant.id}
                    variant={variant}
                    siblings={unit.variants}
                    grouped={unit.group_id !== null}
                />
            ))}
        </div>
    );
}

function VariantForm({
    variant,
    siblings,
    grouped,
}: {
    variant: CatalogCosmetic;
    siblings: CatalogCosmetic[];
    grouped: boolean;
}) {
    const [label, setLabel] = useState(variant.variant_name ?? "");
    const [model, setModel] = useState(variant.model_variant ?? "");
    const [order, setOrder] = useState(String(variant.variant_order));
    const [variantKey, setVariantKey] = useState(variant.variant_key ?? "");
    const knownSlots = variant.slots !== undefined;
    // The catalogue doesn't report slots, so they're only sent when picked.
    const [slots, setSlots] = useState<string[]>(variant.slots ?? []);
    const [picked, setPicked] = useState<Picked>(NOTHING);
    const [outcome, setOutcome] = useState<UploadOutcome | null>(null);
    const [localError, setLocalError] = useState<Error | null>(null);
    const report = useBundleReport(variant.type, picked);

    const showKey = needsVariantKey(variant.type, grouped);
    const skinned = variant.type !== "nameplate" && variant.type !== "effect";
    const shared = sharedAssetVariants(siblings, variant);
    const slotError = slots.length || knownSlots ? validateSlots(variant.type, slots) : null;
    const keyProblems = showKey
        ? variantKeyProblems(
              variant.type,
              variantKey,
              [],
              siblings.filter((other) => other.id !== variant.id).map((other) => other.variant_key),
          )
        : [];

    const missingKeys =
        variant.type === "nameplate" && reportKeys(report).length
            ? [variant, ...shared]
                  .map((other) => other.variant_key)
                  .filter((key): key is string => !!key && !reportKeys(report).includes(key))
            : [];
    const replaceProblems = [
        ...reportProblems(report),
        ...(missingKeys.length
            ? [`The new bundle has no variant ${missingKeys.map((key) => `“${key}”`).join(", ")}. Every variant using this file needs its key in the new one.`]
            : []),
    ];

    const body = buildVariantUpdate(variant, {
        variantName: label,
        modelVariant: model,
        variantOrder: Number(order),
        variantKey: showKey ? variantKey : undefined,
        slots,
    });

    const save = useAdminMutation<void>(() => ({
        method: "POST",
        path: "/cosmetics/manage/update-variant",
        body,
    }));
    const replace = useAdminMutation<NamedBlob>((file) => ({
        method: "POST",
        path: "/cosmetics/manage/replace-asset",
        body: buildReplaceForm(variant.id, file),
    }));
    const uploadCover = useCoverUpload();
    const [covers, setCovers] = useState<{ busy: boolean; made: number; failed: string[] } | null>(null);
    const coversFromFile = needsDashboardCover(variant.type, reportManifest(report));

    const remakeCovers = async (source: File[]) => {
        const targets = variant.type === "nameplate" ? [variant, ...shared] : [variant];
        const failed: string[] = [];
        let made = 0;
        setCovers({ busy: true, made, failed });
        for (const target of targets) {
            try {
                const file = await makeCoverFile({ source, type: variant.type, variantKey: target.variant_key ?? null });
                await uploadCover.mutateAsync({ id: target.id, file });
                made++;
            } catch (error) {
                failed.push(`${variantLabel(target)}: ${(error as Error).message}`);
            }
        }
        setCovers({ busy: false, made, failed });
    };

    const submitReplace = async () => {
        setLocalError(null);
        setCovers(null);
        try {
            const file = await prepareChecked(variant.type, picked);
            const source = picked.files;
            const remake = coversFromFile;
            replace.mutate(file, {
                onSuccess: (data) => {
                    setOutcome(parseUploadOutcome(data));
                    setPicked(NOTHING);
                    if (remake) void remakeCovers(source);
                },
            });
        } catch (error) {
            setLocalError(error as Error);
        }
    };

    const replaceHelp = !coversFromFile
        ? "A new model, texture or emote bundle; the cover re-renders from it"
        : "A new bundle. A new cover is made from it here once it's uploaded.";

    return (
        <div className="flex flex-col gap-3 rounded border border-gray-700 p-3">
            <div className="flex flex-wrap items-center gap-2 text-sm text-gray-400">
                <span className="text-gray-200">
                    {variant.variant_name ?? variant.name ?? `Cosmetic ${variant.id}`}
                </span>
                <span className="font-mono text-xs">#{variant.id}</span>
                {variant.variant_key && <Badge tone="blue">{variant.variant_key}</Badge>}
                {variant.url && (
                    <a
                        href={variant.url}
                        target="_blank"
                        rel="noreferrer"
                        className="ml-auto text-xs text-[#61dafb] hover:underline"
                    >
                        Current file
                    </a>
                )}
            </div>
            {(shared.length > 0 || (variant.color_slots?.length ?? 0) > 0) && (
                <div className="flex flex-col gap-1 text-xs text-gray-500">
                    {shared.length > 0 && <span>Shares its file with {shared.map(variantLabel).join(", ")}.</span>}
                    {variant.color_slots && variant.color_slots.length > 0 && (
                        <span>
                            Color slots:{" "}
                            {variant.color_slots
                                .map((slot) => slot.name)
                                .join(", ")}
                        </span>
                    )}
                </div>
            )}
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    save.mutate(undefined, { onSuccess: () => !knownSlots && setSlots([]) });
                }}
                className="flex flex-col gap-3"
            >
                <div className="flex flex-wrap gap-3">
                    {grouped && (
                        <Field label="Variant label">
                            <input
                                value={label}
                                onChange={(event) => setLabel(event.target.value)}
                                placeholder="Red"
                                className={inputClass}
                            />
                        </Field>
                    )}
                    {showKey && (
                        <VariantKeyField
                            type={variant.type}
                            value={variantKey}
                            onChange={setVariantKey}
                            suggestions={keySuggestions(reportKeys(report), report)}
                            unknown={variant.variant_key === undefined}
                        />
                    )}
                    {skinned && (
                        <Field
                            label="Skin model"
                            help="Re-render the cover after changing this"
                        >
                            <select
                                value={model}
                                onChange={(event) => setModel(event.target.value)}
                                className={inputClass}
                            >
                                <option value="">Any</option>
                                <option value="slim">Slim</option>
                                <option value="wide">Wide</option>
                            </select>
                        </Field>
                    )}
                    {grouped && (
                        <Field label="Order">
                            <input
                                type="number"
                                step="1"
                                value={order}
                                onChange={(event) => setOrder(event.target.value)}
                                required
                                className={inputClass}
                            />
                        </Field>
                    )}
                </div>
                {variant.type !== "emote" && (
                    <Field
                        label={knownSlots ? "Body slots" : "Replace body slots"}
                        help={
                            knownSlots
                                ? "Players wearing it in a removed slot are unequipped."
                                : "Leave empty to keep the current slots. Players wearing it in a removed slot are unequipped."
                        }
                    >
                        <CheckList items={slotItems(variant.type)} selected={slots} onChange={setSlots} />
                    </Field>
                )}
                {slotError && <p className="text-sm text-red-300">{slotError}</p>}
                {keyProblems.length > 0 && <ProblemList problems={keyProblems} />}
                <ProblemBanner error={save.error} />
                {save.isSuccess && <p className="text-sm text-green-300">Saved.</p>}
                <button
                    type="submit"
                    disabled={Object.keys(body).length === 1 || slotError !== null || keyProblems.length > 0 || save.isPending}
                    className={secondaryButton}
                >
                    <Save size={16} />
                    {save.isPending ? "Saving…" : "Save variant"}
                </button>
            </form>
            <div className="flex flex-col gap-2">
                <div className="flex flex-col gap-1 text-sm text-gray-400">
                    Replace file
                    <FilePicker picked={picked} onChange={setPicked} />
                    <span className="text-xs text-gray-600">{replaceHelp}</span>
                </div>
                {variant.type === "nameplate" && (
                    <p className="text-xs text-amber-300">
                        {shared.length
                            ? `${shared.map(variantLabel).join(", ")} use${shared.length === 1 ? "s" : ""} this file too and will move to the new one.`
                            : "Every variant that uses this file moves to the new one."}{" "}
                        Each of their keys has to exist in the new bundle.
                    </p>
                )}
                <BundleNotes report={report} problems={replaceProblems} keys={reportKeys(report)} />
                <button
                    type="button"
                    onClick={() => void submitReplace()}
                    disabled={
                        !picked.files.length ||
                        report === "busy" ||
                        reportInvalid(report) ||
                        replaceProblems.length > 0 ||
                        replace.isPending
                    }
                    className={`${secondaryButton} self-start`}
                >
                    <ImageUp size={16} />
                    {replace.isPending ? "Uploading…" : "Upload"}
                </button>
            </div>
            <ProblemBanner error={localError ?? replace.error} />
            {replace.isSuccess && (
                <p className="text-sm text-green-300">File replaced.</p>
            )}
            {covers?.busy && <p className="text-sm text-gray-400">Making a new cover from the file…</p>}
            {covers && !covers.busy && covers.made > 0 && (
                <p className="text-sm text-green-300">
                    New cover{covers.made === 1 ? "" : "s"} made from the file. Change {covers.made === 1 ? "it" : "them"} under
                    Cover if needed.
                </p>
            )}
            {covers && !covers.busy && covers.failed.length > 0 && (
                <ProblemList problems={covers.failed.map((line) => `Couldn't make a cover for ${line}`)} />
            )}
            <OutcomeNotes outcome={outcome} />
        </div>
    );
}
