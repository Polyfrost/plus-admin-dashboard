import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { zipSync } from "fflate";
import { Eye, EyeOff, ImageUp, Pencil, Save, Shirt, Upload, X } from "lucide-react";
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
    Panel,
    Table,
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

function CosmeticsRoute() {
    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-10 p-6">
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
            <UploadForm />
            <CosmeticList />
        </div>
    );
}

function UploadForm() {
    const [type, setType] = useState<CosmeticType>("cape");
    const [name, setName] = useState("");
    const [slots, setSlots] = useState<BodySlot[]>(DEFAULT_SLOTS.cape);
    // Setting a group makes this upload a variant of it (found or created by
    // the backend), so players buy it once and choose between variants.
    const [group, setGroup] = useState("");
    const [variantName, setVariantName] = useState("");
    const [modelVariant, setModelVariant] = useState("");
    const [variantOrder, setVariantOrder] = useState("");
    const [files, setFiles] = useState<File[]>([]);
    const [isFolder, setIsFolder] = useState(false);
    const [inputKey, setInputKey] = useState(0);
    const isEmote = type === "emote";

    const upload = useAdminMutation<FormData>((form) => ({
        method: "POST",
        path: "/cosmetics/manage/create",
        body: form,
    }));

    const submit = async (event: React.FormEvent) => {
        event.preventDefault();
        const form = new FormData();
        if (isFolder) {
            const zipped = await buildBundle(files);
            form.append("file", new Blob([zipped as BlobPart], { type: "application/zip" }), "bundle.zip");
        } else {
            form.append("file", files[0], files[0].name);
        }
        if (name.trim()) form.append("name", name.trim());
        form.append("type", type);
        if (!isEmote) {
            for (const slot of slots) form.append("slots", slot);
            if (group.trim()) form.append("group", group.trim());
            if (variantName.trim()) form.append("variant_name", variantName.trim());
            if (modelVariant) form.append("model_variant", modelVariant);
            if (variantOrder.trim()) form.append("variant_order", variantOrder.trim());
        }
        upload.mutate(form, {
            onSuccess: () => {
                setFiles([]);
                setInputKey(inputKey + 1);
            },
        });
    };

    const fileCount = files.filter((file) => !isMacosJunk(relativePath(file))).length;

    return (
        <Panel title="Upload" description="A single file (texture, or a pre-made .zip bundle) or a folder, which is zipped in the browser.">
            <div className="grid gap-6 md:grid-cols-[1fr_320px]">
                <form onSubmit={submit} className="flex flex-col gap-4 rounded-lg bg-gray-800 p-5 shadow-xl">
                    <div className="flex flex-wrap gap-3">
                        <Field label="Type">
                            <select
                                value={type}
                                onChange={(event) => {
                                    const next = event.target.value as CosmeticType;
                                    setType(next);
                                    setSlots(DEFAULT_SLOTS[next]);
                                }}
                                className={inputClass}
                            >
                                {TYPES.map((t) => (
                                    <option key={t} value={t}>
                                        {t}
                                    </option>
                                ))}
                            </select>
                        </Field>
                        <Field label="Display name">
                            <input
                                value={name}
                                onChange={(event) => setName(event.target.value)}
                                placeholder={`Defaults to "${type}"`}
                                className={inputClass}
                            />
                        </Field>
                    </div>

                    {!isEmote && (
                        <Field label="Allowed slots">
                            <CheckList
                                items={BODY_SLOTS.map((slot) => ({ id: slot, label: slot }))}
                                selected={slots}
                                onChange={setSlots}
                            />
                        </Field>
                    )}

                    {!isEmote && (
                        <div className="flex flex-col gap-3 rounded border border-gray-700 p-3">
                            <span className="text-sm text-gray-400">
                                Variant grouping{" "}
                                <span className="text-gray-600">(leave Group blank for a standalone cosmetic)</span>
                            </span>
                            <div className="flex flex-wrap gap-3">
                                <Field label="Group">
                                    <input
                                        value={group}
                                        onChange={(event) => setGroup(event.target.value)}
                                        placeholder="Pride Cape"
                                        className={inputClass}
                                    />
                                </Field>
                                <Field label="Variant label">
                                    <input
                                        value={variantName}
                                        onChange={(event) => setVariantName(event.target.value)}
                                        placeholder="Blue"
                                        className={inputClass}
                                    />
                                </Field>
                                <Field label="Skin model">
                                    <select
                                        value={modelVariant}
                                        onChange={(event) => setModelVariant(event.target.value)}
                                        className={inputClass}
                                    >
                                        <option value="">Any</option>
                                        <option value="slim">Slim</option>
                                        <option value="wide">Wide</option>
                                    </select>
                                </Field>
                                <Field label="Order" help="Lowest first; ties by ID">
                                    <input
                                        type="number"
                                        value={variantOrder}
                                        onChange={(event) => setVariantOrder(event.target.value)}
                                        placeholder="0"
                                        className={inputClass}
                                    />
                                </Field>
                            </div>
                        </div>
                    )}

                    <div className="flex flex-wrap items-end gap-3">
                        <Field label="File">
                            <input
                                key={`file-${inputKey}`}
                                type="file"
                                onChange={(event) => {
                                    setFiles(Array.from(event.target.files ?? []).slice(0, 1));
                                    setIsFolder(false);
                                }}
                                className={inputClass}
                            />
                        </Field>
                        <Field label="Or folder" help={isFolder && fileCount ? `${fileCount} file(s) will be bundled` : ".DS_Store ignored"}>
                            <input
                                key={`folder-${inputKey}`}
                                type="file"
                                multiple
                                ref={(el) => el?.setAttribute("webkitdirectory", "")}
                                onChange={(event) => {
                                    setFiles(Array.from(event.target.files ?? []));
                                    setIsFolder(true);
                                }}
                                className={inputClass}
                            />
                        </Field>
                    </div>

                    <ErrorBanner error={upload.error} />
                    {upload.isSuccess && (
                        <p className="text-sm text-green-300">
                            Uploaded #{(upload.data as { id: number } | null)?.id}.
                        </p>
                    )}
                    <button
                        type="submit"
                        disabled={!files.length || (!isEmote && !slots.length) || upload.isPending}
                        className={primaryButton}
                    >
                        <Upload size={16} />
                        {upload.isPending ? "Uploading…" : isEmote ? "Upload emote" : "Upload cosmetic"}
                    </button>
                </form>

                <div className="flex flex-col gap-2">
                    <span className="text-sm text-gray-400">Preview</span>
                    <CosmeticPreview
                        source={files.length ? files : null}
                        type={type}
                        bodySlot={slots[0] ?? previewSlot(type)}
                        className="h-96 w-full"
                    />
                </div>
            </div>
        </Panel>
    );
}

function CosmeticList() {
    const catalog = useCatalog();
    const units = useMemo(() => cosmeticUnits(catalog.data), [catalog.data]);
    const [typeFilter, setTypeFilter] = useState("all");
    const [search, setSearch] = useState("");
    const [editing, setEditing] = useState<string | null>(null);

    const needle = search.trim().toLowerCase();
    const shown = units.filter(
        (unit) =>
            (typeFilter === "all" || unit.type === typeFilter) &&
            (!needle || `${unit.name} ${unit.variants.map((v) => v.id).join(" ")}`.toLowerCase().includes(needle)),
    );

    return (
        <Panel
            title={`Library (${units.length})`}
            description="Disabling hides a cosmetic from the store and the client; owners keep it and it can be re-enabled."
        >
            <div className="flex flex-wrap gap-3">
                <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search name or ID…"
                    className={inputClass}
                />
                <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)} className={inputClass}>
                    <option value="all">All types</option>
                    {TYPES.map((t) => (
                        <option key={t} value={t}>
                            {t}
                        </option>
                    ))}
                </select>
            </div>

            <ErrorBanner error={catalog.error} />
            {catalog.isPending && <p className="text-sm text-gray-500">Loading the catalogue…</p>}

            <Table headers={["", "Cosmetic", "Type", "Variants", "Price", "Status", ""]} empty={!catalog.isPending && !shown.length}>
                {shown.map((unit) => (
                    <CosmeticRow
                        key={unit.key}
                        unit={unit}
                        open={editing === unit.key}
                        onToggle={() => setEditing(editing === unit.key ? null : unit.key)}
                    />
                ))}
            </Table>
        </Panel>
    );
}

function CosmeticRow({ unit, open, onToggle }: { unit: CosmeticUnit; open: boolean; onToggle: () => void }) {
    const setEnabled = useAdminMutation<boolean>((enabled) => ({
        method: "POST",
        path: "/cosmetics/manage/update",
        body: { cosmetic_id: unit.first.id, enabled },
    }));

    return (
        <>
            <tr>
                <td className="w-14 px-4 py-2">
                    {unit.cover_url ? (
                        <img src={unit.cover_url} alt="" className="h-10 w-10 rounded bg-gray-900 object-contain" />
                    ) : (
                        <div className="h-10 w-10 rounded bg-gray-900" />
                    )}
                </td>
                <td className="px-4 py-2">
                    {unit.name}
                    <span className="ml-2 font-mono text-xs text-gray-500">#{unit.first.id}</span>
                </td>
                <td className="px-4 py-2 text-gray-500">{unit.type}</td>
                <td className="px-4 py-2 text-gray-500">{unit.variants.length}</td>
                <td className="px-4 py-2 text-gray-500">
                    {unit.store_product_id ? formatPrice(unit.base_price) : "not sold"}
                </td>
                <td className="px-4 py-2">
                    <Badge tone={unit.enabled ? "green" : "amber"}>{unit.enabled ? "enabled" : "disabled"}</Badge>
                </td>
                <td className="px-4 py-2">
                    <div className="flex items-center gap-3">
                        <button onClick={onToggle} title="Edit" className="text-gray-400 hover:text-gray-100">
                            {open ? <X size={16} /> : <Pencil size={16} />}
                        </button>
                        <button
                            onClick={() => {
                                if (!unit.enabled || confirm(`Disable "${unit.name}"? Owners keep it; it can be re-enabled.`)) {
                                    setEnabled.mutate(!unit.enabled);
                                }
                            }}
                            disabled={setEnabled.isPending}
                            title={unit.enabled ? "Disable" : "Enable"}
                            className="text-gray-400 hover:text-gray-100 disabled:opacity-50"
                        >
                            {unit.enabled ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                    </div>
                </td>
            </tr>
            {(open || setEnabled.error) && (
                <tr>
                    <td colSpan={7} className="bg-gray-900/40 px-4 py-4">
                        <ErrorBanner error={setEnabled.error} />
                        {open && (
                            <div className="grid gap-6 md:grid-cols-[1fr_320px]">
                                <div className="flex flex-col gap-6">
                                    <DetailsForm unit={unit} />
                                    <VariantsEditor unit={unit} />
                                </div>
                                <UnitPreview unit={unit} />
                            </div>
                        )}
                    </td>
                </tr>
            )}
        </>
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
