import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { zipSync } from "fflate";
import {
    ArrowLeft,
    ArrowRight,
    Check,
    Eye,
    EyeOff,
    FileUp,
    FolderUp,
    ImageUp,
    Plus,
    Save,
    Shirt,
    Trash2,
    Upload,
    X,
} from "lucide-react";
import {
    BODY_SLOTS,
    cosmeticUnits,
    formatPrice,
    useAdminMutation,
    useCatalog,
    type BodySlot,
    type CatalogCosmetic,
    type CosmeticUnit,
} from "@/lib/store-api";
import {
    Badge,
    CheckList,
    ErrorBanner,
    Field,
    inputClass,
    primaryButton,
    secondaryButton,
} from "@/components/store/shared";
import { CosmeticPreview, isMacosJunk } from "@/components/CosmeticPreview";

export const Route = createFileRoute("/cosmetics")({
    component: CosmeticsRoute,
});

const TYPES = [
    "cape",
    "backpack",
    "glasses",
    "wings",
    "glove",
    "hat",
    "aura",
    "boots",
    "shoulder",
    "pet",
    "emote",
] as const;
type CosmeticType = (typeof TYPES)[number];

const DEFAULT_SLOTS: Record<CosmeticType, BodySlot[]> = {
    cape: ["cape"],
    backpack: ["backpack"],
    glasses: ["glasses"],
    wings: ["wings"],
    glove: ["left_hand", "right_hand"],
    hat: ["hat"],
    aura: ["aura"],
    boots: ["boots"],
    shoulder: ["shoulder"],
    pet: ["pet"],
    emote: [],
};

/** What to pick in the Files step, per type. */
const fileHint = (type: CosmeticType) =>
    type === "cape"
        ? "A cape texture (.png), or a folder with the texture and its animation sheet."
        : type === "emote"
          ? "A folder or .zip with the emote's animation (.json)."
          : "A folder or .zip with the model (.geo.json) and its texture (.png); an animation (.json) is optional.";

const previewSlot = (type: string) =>
    DEFAULT_SLOTS[type as CosmeticType]?.[0] ?? "hat";

const relativePath = (file: File) =>
    (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;

/** Zips a picked folder in the browser, dropping its top-level directory. */
function buildBundle(files: File[]): Promise<Uint8Array> {
    return Promise.all(
        files
            .filter((file) => !isMacosJunk(relativePath(file)))
            .map(async (file) => {
                const segments = relativePath(file).split("/");
                const inner = segments.length > 1 ? segments.slice(1).join("/") : file.name;
                return [inner, new Uint8Array(await file.arrayBuffer())] as const;
            }),
    ).then((entries) => zipSync(Object.fromEntries(entries)));
}

/** Files picked for one upload: a single file, or a whole folder. */
interface Picked {
    files: File[];
    folder: boolean;
}
const NOTHING: Picked = { files: [], folder: false };

async function appendFile(form: FormData, picked: Picked) {
    if (picked.folder) {
        const zipped = await buildBundle(picked.files);
        form.append("file", new Blob([zipped as BlobPart], { type: "application/zip" }), "bundle.zip");
    } else {
        form.append("file", picked.files[0], picked.files[0].name);
    }
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
                        Upload, edit and disable cosmetics and emotes. Uploading never
                        puts anything on sale — price it from Store → Products.
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
}
const newDraft = (): Draft => ({ ...NOTHING, key: crypto.randomUUID(), label: "", model: "" });

type UploadState = "busy" | "done" | Error;

function CreateWizard({ onClose }: { onClose: () => void }) {
    const catalog = useCatalog();
    const [step, setStep] = useState(0);
    const [type, setType] = useState<CosmeticType | null>(null);
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [slots, setSlots] = useState<BodySlot[]>([]);
    const [withVariants, setWithVariants] = useState(false);
    const [drafts, setDrafts] = useState<Draft[]>([newDraft()]);
    const [previewKey, setPreviewKey] = useState(drafts[0].key);
    const [states, setStates] = useState<Record<string, UploadState>>({});
    const create = useCreateCosmetic();

    const isEmote = type === "emote";
    const grouped = withVariants && !isEmote;
    const shownDrafts = grouped ? drafts : drafts.slice(0, 1);
    // The backend finds groups by name and type, so a taken name adds to it.
    const existingGroup = cosmeticUnits(catalog.data).find(
        (unit) => unit.group_id !== null && unit.type === type && unit.name === name.trim(),
    );
    const uploading = Object.values(states).includes("busy");
    const allDone = shownDrafts.every((draft) => states[draft.key] === "done");

    const stepValid = [
        type !== null,
        name.trim() !== "" && (isEmote || slots.length > 0),
        shownDrafts.every((draft) => draft.files.length > 0 && (!grouped || draft.label.trim())),
        true,
    ];

    const patchDraft = (key: string, patch: Partial<Draft>) =>
        setDrafts(drafts.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)));

    const uploadAll = async () => {
        const baseOrder = existingGroup ? Math.max(...existingGroup.variants.map((v) => v.variant_order)) + 1 : 0;
        for (const [index, draft] of shownDrafts.entries()) {
            if (states[draft.key] === "done") continue;
            setStates((all) => ({ ...all, [draft.key]: "busy" }));
            try {
                const form = new FormData();
                await appendFile(form, draft);
                form.append("type", type!);
                form.append("name", name.trim());
                if (description.trim()) form.append("description", description.trim());
                for (const slot of isEmote ? [] : slots) form.append("slots", slot);
                if (grouped) {
                    form.append("group", name.trim());
                    form.append("variant_name", draft.label.trim());
                    form.append("variant_order", String(baseOrder + index));
                    if (draft.model) form.append("model_variant", draft.model);
                }
                await create.mutateAsync(form);
                setStates((all) => ({ ...all, [draft.key]: "done" }));
            } catch (error) {
                setStates((all) => ({ ...all, [draft.key]: error as Error }));
                return;
            }
        }
    };

    const close = () => {
        const started = drafts.some((draft) => draft.files.length) && !allDone;
        if (!started || confirm("Discard this cosmetic? Nothing that wasn't uploaded is kept.")) onClose();
    };

    const preview = shownDrafts.find((draft) => draft.key === previewKey) ?? shownDrafts[0];

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
                                onClick={() => setStep(index)}
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
                                    if (t !== type) setSlots(DEFAULT_SLOTS[t]);
                                    setType(t);
                                    setStep(1);
                                }}
                                className={`rounded-lg border px-4 py-5 text-left capitalize transition ${
                                    t === type
                                        ? "border-[#61dafb] bg-[#61dafb]/10 text-gray-100"
                                        : "border-gray-700 bg-gray-900/40 text-gray-300 hover:border-gray-500"
                                }`}
                            >
                                <div className="font-semibold">{t}</div>
                                <div className="mt-1 text-xs normal-case text-gray-500">
                                    {t === "emote" ? "An animation the player performs" : `Worn on: ${DEFAULT_SLOTS[t].join(", ")}`}
                                </div>
                            </button>
                        ))}
                    </div>
                </Step>
            )}

            {step === 1 && (
                <Step title="Name it" hint="Players see the name and description in the store and wardrobe.">
                    <div className="flex max-w-2xl flex-col gap-4">
                        <Field label="Name">
                            <input
                                value={name}
                                onChange={(event) => setName(event.target.value)}
                                placeholder="Pride Cape"
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
                                            hint="E.g. colours, or slim/wide arms. Players buy it once and pick a variant."
                                        />
                                    </div>
                                </div>
                                {grouped && existingGroup && (
                                    <p className="rounded border border-sky-800 bg-sky-900/30 px-3 py-2 text-sm text-sky-200">
                                        A {type} called “{existingGroup.name}” already has{" "}
                                        {existingGroup.variants.length} variant(s). The ones you add here join it.
                                    </p>
                                )}
                                <details className="text-sm text-gray-400">
                                    <summary className="cursor-pointer select-none">
                                        Body slots: {slots.join(", ") || "none"}{" "}
                                        <span className="text-gray-600">(defaults for {type}; change only if needed)</span>
                                    </summary>
                                    <div className="mt-2">
                                        <CheckList
                                            items={BODY_SLOTS.map((slot) => ({ id: slot, label: slot }))}
                                            selected={slots}
                                            onChange={setSlots}
                                        />
                                    </div>
                                </details>
                            </>
                        )}
                    </div>
                </Step>
            )}

            {step === 2 && type && (
                <Step title={grouped ? "Add the variants" : "Pick the file"} hint={fileHint(type)}>
                    <div className="grid gap-6 md:grid-cols-[1fr_320px]">
                        <div className="flex flex-col gap-3">
                            {shownDrafts.map((draft, index) => (
                                <div
                                    key={draft.key}
                                    onFocusCapture={() => setPreviewKey(draft.key)}
                                    onClick={() => setPreviewKey(draft.key)}
                                    className={`flex flex-col gap-3 rounded-lg border p-4 ${
                                        preview.key === draft.key ? "border-[#61dafb]/60" : "border-gray-700"
                                    }`}
                                >
                                    {grouped && (
                                        <div className="flex flex-wrap items-end gap-3">
                                            <Field label={`Variant ${index + 1} label`}>
                                                <input
                                                    value={draft.label}
                                                    onChange={(event) => patchDraft(draft.key, { label: event.target.value })}
                                                    placeholder={["Red", "Blue", "Green"][index % 3]}
                                                    className={inputClass}
                                                />
                                            </Field>
                                            <Field label="Skin model">
                                                <select
                                                    value={draft.model}
                                                    onChange={(event) =>
                                                        patchDraft(draft.key, { model: event.target.value as Draft["model"] })
                                                    }
                                                    className={inputClass}
                                                >
                                                    <option value="">Any</option>
                                                    <option value="slim">Slim only</option>
                                                    <option value="wide">Wide only</option>
                                                </select>
                                            </Field>
                                            {drafts.length > 1 && (
                                                <button
                                                    onClick={() => setDrafts(drafts.filter((d) => d.key !== draft.key))}
                                                    title="Remove variant"
                                                    className="mb-2 text-gray-500 hover:text-red-300"
                                                >
                                                    <Trash2 size={16} />
                                                </button>
                                            )}
                                        </div>
                                    )}
                                    <FilePicker picked={draft} onChange={(picked) => patchDraft(draft.key, picked)} />
                                </div>
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
                                source={preview.files.length ? preview.files : null}
                                type={type}
                                bodySlot={slots[0] ?? previewSlot(type)}
                                className="h-96 w-full"
                            />
                        </div>
                    </div>
                </Step>
            )}

            {step === 3 && type && (
                <Step
                    title={allDone ? "Uploaded" : "Review and upload"}
                    hint={
                        allDone
                            ? "It's in the library, not on sale. Price it from Store → Products when it's ready."
                            : "Nothing is put on sale; price it from Store → Products afterwards."
                    }
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
                        </dl>
                        <ul className="flex flex-col divide-y divide-gray-700 rounded-lg border border-gray-700">
                            {shownDrafts.map((draft) => {
                                const state = states[draft.key];
                                return (
                                    <li key={draft.key} className="flex flex-col gap-1 px-4 py-3 text-sm">
                                        <div className="flex items-center gap-3">
                                            <span className="text-gray-200">{grouped ? draft.label : name.trim()}</span>
                                            {draft.model && <Badge>{draft.model}</Badge>}
                                            <span className="truncate text-xs text-gray-500">{pickedSummary(draft)}</span>
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
                                        {state instanceof Error && <ErrorBanner error={state} />}
                                    </li>
                                );
                            })}
                        </ul>
                        {allDone ? (
                            <button onClick={onClose} className={primaryButton}>
                                <Check size={16} />
                                Back to the library
                            </button>
                        ) : (
                            <button onClick={uploadAll} disabled={uploading} className={primaryButton}>
                                <Upload size={16} />
                                {uploading
                                    ? "Uploading…"
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
                    <button onClick={() => setStep(step - 1)} className={secondaryButton}>
                        <ArrowLeft size={16} />
                        Back
                    </button>
                    <button onClick={() => setStep(step + 1)} disabled={!stepValid[step]} className={primaryButton}>
                        Next
                        <ArrowRight size={16} />
                    </button>
                </div>
            )}
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
    const count = files.filter((file) => !isMacosJunk(relativePath(file))).length;
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
            (!needle || `${unit.name} ${unit.variants.map((v) => v.id).join(" ")}`.toLowerCase().includes(needle)),
    );
    // Looked up from all units so disabling one doesn't close its editor.
    const editingUnit = units.find((unit) => unit.key === editing);

    return (
        <div className="flex flex-col gap-4">
            <div className="flex flex-wrap items-center gap-3">
                <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search name or ID…"
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
                        <div className="aspect-square bg-gray-900">
                            {unit.cover_url && (
                                <img src={unit.cover_url} alt="" loading="lazy" className="h-full w-full object-contain" />
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
                                    <Badge tone="amber">disabled</Badge>
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

    return (
        <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center gap-3">
                <h2 className="text-xl font-bold text-gray-100">{unit.name}</h2>
                <span className="font-mono text-xs text-gray-500">#{unit.first.id}</span>
                <Badge>{unit.type}</Badge>
                <Badge tone={unit.enabled ? "green" : "amber"}>{unit.enabled ? "enabled" : "disabled"}</Badge>
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

/** Uploads one more variant into an existing group. */
function AddVariantForm({ unit }: { unit: CosmeticUnit }) {
    const [label, setLabel] = useState("");
    const [model, setModel] = useState("");
    const [picked, setPicked] = useState<Picked>(NOTHING);
    const create = useCreateCosmetic();

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        const form = new FormData();
        await appendFile(form, picked);
        form.append("type", unit.type);
        form.append("name", unit.name);
        form.append("group", unit.name);
        form.append("variant_name", label.trim());
        form.append("variant_order", String(Math.max(...unit.variants.map((v) => v.variant_order)) + 1));
        if (model) form.append("model_variant", model);
        // The catalogue doesn't report the group's slots; defaults are merged in.
        for (const slot of DEFAULT_SLOTS[unit.type as CosmeticType] ?? []) form.append("slots", slot);
        create.mutate(form, {
            onSuccess: () => {
                setLabel("");
                setModel("");
                setPicked(NOTHING);
            },
        });
    };

    return (
        <form onSubmit={submit} className="flex flex-col gap-3 rounded border border-dashed border-gray-600 p-3">
            <div className="font-semibold text-gray-300">Add a variant</div>
            <div className="flex flex-wrap gap-3">
                <Field label="Variant label">
                    <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Green" className={inputClass} />
                </Field>
                <Field label="Skin model">
                    <select value={model} onChange={(event) => setModel(event.target.value)} className={inputClass}>
                        <option value="">Any</option>
                        <option value="slim">Slim only</option>
                        <option value="wide">Wide only</option>
                    </select>
                </Field>
            </div>
            <FilePicker picked={picked} onChange={setPicked} />
            <ErrorBanner error={create.error} />
            {create.isSuccess && <p className="text-sm text-green-300">Variant added.</p>}
            <button type="submit" disabled={!label.trim() || !picked.files.length || create.isPending} className={secondaryButton}>
                <Upload size={16} />
                {create.isPending ? "Uploading…" : "Upload variant"}
            </button>
        </form>
    );
}

function UnitPreview({ unit }: { unit: CosmeticUnit }) {
    const [variantId, setVariantId] = useState(unit.first.id);
    const variant = unit.variants.find((v) => v.id === variantId) ?? unit.first;

    return (
        <div className="flex flex-col gap-2">
            {unit.variants.length > 1 ? (
                <select value={variant.id} onChange={(event) => setVariantId(Number(event.target.value))} className={inputClass}>
                    {unit.variants.map((v) => (
                        <option key={v.id} value={v.id}>
                            {v.variant_name ?? `#${v.id}`}
                            {v.model_variant ? ` (${v.model_variant})` : ""}
                        </option>
                    ))}
                </select>
            ) : (
                <span className="text-sm text-gray-400">Preview</span>
            )}
            <CosmeticPreview source={variant.url} type={unit.type} bodySlot={previewSlot(unit.type)} />
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
                    grouped={unit.group_id !== null}
                />
            ))}
        </div>
    );
}

function VariantForm({
    variant,
    grouped,
}: {
    variant: CatalogCosmetic;
    grouped: boolean;
}) {
    const [label, setLabel] = useState(variant.variant_name ?? "");
    const [model, setModel] = useState(variant.model_variant ?? "");
    const [order, setOrder] = useState(String(variant.variant_order));
    // The catalogue doesn't report slots, so they're only sent when picked.
    const [slots, setSlots] = useState<string[]>([]);
    const [file, setFile] = useState<File | null>(null);
    const [fileKey, setFileKey] = useState(0);

    const body = {
        cosmetic_id: variant.id,
        ...(label !== (variant.variant_name ?? "") && {
            variant_name: label.trim() || null,
        }),
        ...(model !== (variant.model_variant ?? "") && {
            model_variant: model || null,
        }),
        ...(Number(order) !== variant.variant_order && {
            variant_order: Number(order),
        }),
        ...(slots.length > 0 && { slots }),
    };

    const save = useAdminMutation<void>(() => ({
        method: "POST",
        path: "/cosmetics/manage/update-variant",
        body,
    }));
    const replace = useAdminMutation<File>((picked) => {
        const form = new FormData();
        form.append("cosmetic_id", String(variant.id));
        form.append("file", picked, picked.name);
        return { method: "POST", path: "/cosmetics/manage/replace-asset", body: form };
    });

    return (
        <div className="flex flex-col gap-3 rounded border border-gray-700 p-3">
            <div className="flex items-center gap-2 text-sm text-gray-400">
                <span className="text-gray-200">
                    {variant.variant_name ?? variant.name ?? `Cosmetic ${variant.id}`}
                </span>
                <span className="font-mono text-xs">#{variant.id}</span>
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
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    save.mutate(undefined, { onSuccess: () => setSlots([]) });
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
                <Field
                    label="Replace body slots"
                    help="Leave empty to keep the current slots. Players wearing it in a removed slot are unequipped."
                >
                    <CheckList
                        items={BODY_SLOTS.map((slot) => ({ id: slot, label: slot }))}
                        selected={slots}
                        onChange={setSlots}
                    />
                </Field>
                <ErrorBanner error={save.error} />
                {save.isSuccess && <p className="text-sm text-green-300">Saved.</p>}
                <button
                    type="submit"
                    disabled={Object.keys(body).length === 1 || save.isPending}
                    className={secondaryButton}
                >
                    <Save size={16} />
                    {save.isPending ? "Saving…" : "Save variant"}
                </button>
            </form>
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    if (!file) return;
                    replace.mutate(file, {
                        onSuccess: () => {
                            setFile(null);
                            setFileKey(fileKey + 1);
                        },
                    });
                }}
                className="flex flex-wrap items-end gap-3"
            >
                <Field
                    label="Replace file"
                    help="A new model, texture or emote bundle; the cover re-renders from it"
                >
                    <input
                        key={fileKey}
                        type="file"
                        onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                        className={inputClass}
                    />
                </Field>
                <button
                    type="submit"
                    disabled={!file || replace.isPending}
                    className={secondaryButton}
                >
                    <ImageUp size={16} />
                    {replace.isPending ? "Uploading…" : "Upload"}
                </button>
            </form>
            <ErrorBanner error={replace.error} />
            {replace.isSuccess && (
                <p className="text-sm text-green-300">File replaced.</p>
            )}
        </div>
    );
}
