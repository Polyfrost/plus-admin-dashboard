import { unzipSync } from "fflate";
import { issueLevel, portedIssueText, type IssueFields } from "./issue-text";
import type { Catalog, CatalogCosmetic } from "./store-api";

export const COSMETIC_TYPES = [
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
    "nameplate",
    "effect",
    "emote",
] as const;
export type CosmeticType = (typeof COSMETIC_TYPES)[number];

export const BODY_SLOTS = [
    "cape",
    "backpack",
    "glasses",
    "wings",
    "left_hand",
    "right_hand",
    "hat",
    "aura",
    "boots",
    "shoulder",
    "pet",
    "tail",
    "nameplate",
    "effect_a",
    "effect_b",
] as const;
export type BodySlot = (typeof BODY_SLOTS)[number];

export const EFFECT_SLOTS: readonly BodySlot[] = ["effect_a", "effect_b"];

export const DEFAULT_SLOTS: Record<CosmeticType, BodySlot[]> = {
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
    nameplate: ["nameplate"],
    effect: ["effect_a", "effect_b"],
    emote: [],
};

export const SLOT_HINTS: Partial<Record<BodySlot, string>> = {
    effect_a: "trails",
    effect_b: "moments",
    tail: "any type except effects",
};

export function isCosmeticType(type: string): type is CosmeticType {
    return (COSMETIC_TYPES as readonly string[]).includes(type);
}

export function slotOptions(type: string): BodySlot[] {
    if (type === "emote") return [];
    if (type === "nameplate") return ["nameplate"];
    if (type === "effect") return [...EFFECT_SLOTS];
    return BODY_SLOTS.filter((slot) => slot !== "nameplate" && !EFFECT_SLOTS.includes(slot));
}

export interface EffectContent {
    trails: boolean;
    moments: boolean;
}

export interface EffectSlotGuess {
    slots: BodySlot[];
    needsChoice: boolean;
    hint: string | null;
}

export function inferEffectSlots(content: EffectContent | null | undefined): EffectSlotGuess {
    if (!content) {
        return {
            slots: [],
            needsChoice: true,
            hint: "The bundle couldn't be read, so pick where this effect goes: effect_a for trails or effect_b for moments.",
        };
    }
    if (content.trails && content.moments) {
        return {
            slots: [],
            needsChoice: true,
            hint: "This bundle has both trails and moments, so pick where it goes: effect_a for trails or effect_b for moments.",
        };
    }
    if (content.trails) return { slots: ["effect_a"], needsChoice: false, hint: "This bundle has trails, so it goes in effect_a." };
    if (content.moments) return { slots: ["effect_b"], needsChoice: false, hint: "This bundle has named moments, so it goes in effect_b." };
    return {
        slots: [],
        needsChoice: true,
        hint: "This bundle has no trails or moments, so pick where it goes: effect_a for trails or effect_b for moments.",
    };
}

export function validateSlots(type: string, slots: readonly string[]): string | null {
    const unknown = slots.find((slot) => !(BODY_SLOTS as readonly string[]).includes(slot));
    if (unknown) return `“${unknown}” isn't a body slot.`;
    if (type !== "emote" && slots.length === 0) return "Pick at least one body slot.";
    if (type === "nameplate") {
        return slots.length === 1 && slots[0] === "nameplate"
            ? null
            : "Nameplates go in the nameplate slot and nowhere else.";
    }
    if (slots.includes("nameplate")) return "Only nameplates go in the nameplate slot.";
    const effectSlots = slots.filter((slot) => EFFECT_SLOTS.includes(slot as BodySlot));
    if (type === "effect") {
        return effectSlots.length === slots.length ? null : "Effects only go in effect_a and effect_b.";
    }
    if (effectSlots.length) return "Only effects go in effect_a and effect_b.";
    return null;
}

export type CoverMode = "render" | "upload";

export function coverMode(type: string, hasManifest = false): CoverMode {
    return type === "effect" || type === "nameplate" || hasManifest ? "upload" : "render";
}

export interface GroupVisibility {
    name: string;
    enabled: boolean;
}

export interface UploadVisibility {
    enabled: boolean | undefined;
    publishGroup: boolean;
    toggle: string | null;
    summary: string | null;
    hint: string | null;
}

export function uploadVisibility(type: string, group: GroupVisibility | null, publish: boolean): UploadVisibility {
    if (group?.enabled) {
        return {
            enabled: undefined,
            publishGroup: false,
            toggle: null,
            summary: "Live as soon as they're uploaded",
            hint: `“${group.name}” is live, so players see the new variants as soon as they're uploaded.`,
        };
    }
    if (group) {
        return {
            enabled: undefined,
            publishGroup: publish,
            toggle: "Make the group live after the upload",
            summary: publish ? "The whole group goes live once the upload finishes" : "Hidden, like the rest of the group",
            hint: publish
                ? `“${group.name}” is hidden. Once every variant is uploaded, the whole group goes live, including the variants it already has.`
                : `“${group.name}” is hidden, so players won't see the new variants until you enable it from the library.`,
        };
    }
    if (type !== "nameplate") return { enabled: undefined, publishGroup: false, toggle: null, summary: null, hint: null };
    return {
        enabled: publish,
        publishGroup: false,
        toggle: "Publish now",
        summary: publish ? "Live as soon as it's uploaded" : "Hidden until you enable it",
        hint: publish
            ? "Players can see it as soon as it's uploaded."
            : "Nameplates upload hidden. Enable it from the library once it looks right.",
    };
}

export function needsVariantKey(type: string, grouped: boolean): boolean {
    return type === "nameplate" || grouped;
}

export type IssueLevel = "error" | "warning" | "info";

export interface Issue {
    code: string;
    level: IssueLevel;
    path: string;
    values: Record<string, number>;
    names: Record<string, string>;
}

export interface BundleAnalysis {
    requires: string[];
    quads: number;
    bones: number;
    spring_bones: number;
    live_particles: number;
    trail_points: number;
    record_bytes: number;
    texture_bytes: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickEntries<T>(value: unknown, keep: (entry: unknown) => entry is T): Record<string, T> {
    if (!isRecord(value)) return {};
    return Object.fromEntries(Object.entries(value).filter(([, entry]) => keep(entry))) as Record<string, T>;
}

export function parseIssue(value: unknown): Issue | null {
    if (!isRecord(value) || typeof value.code !== "string") return null;
    return {
        code: value.code,
        level: issueLevel({ code: value.code, level: typeof value.level === "string" ? value.level : undefined }),
        path: typeof value.path === "string" ? value.path : "",
        values: pickEntries(value.values, (entry): entry is number => typeof entry === "number"),
        names: pickEntries(value.names, (entry): entry is string => typeof entry === "string"),
    };
}

export function parseIssues(value: unknown): Issue[] {
    if (!Array.isArray(value)) return [];
    return value.map(parseIssue).filter((issue): issue is Issue => issue !== null);
}

export interface ErrorBody {
    message: string;
    issues: Issue[];
}

export function parseErrorBody(status: number, text: string): ErrorBody {
    const trimmed = text.trim();
    const fallback = { message: trimmed || `Request failed (${status})`, issues: [] };
    if (!trimmed.startsWith("{")) return fallback;
    try {
        const json: unknown = JSON.parse(trimmed);
        if (!isRecord(json)) return fallback;
        return {
            message: typeof json.message === "string" && json.message ? json.message : fallback.message,
            issues: parseIssues(json.issues),
        };
    } catch {
        return fallback;
    }
}

export class ApiError extends Error {
    readonly status: number;
    readonly issues: Issue[];

    constructor(status: number, body: ErrorBody) {
        super(body.message);
        this.name = "ApiError";
        this.status = status;
        this.issues = body.issues;
    }
}

export function errorIssues(error: unknown): Issue[] {
    return error instanceof ApiError ? error.issues : [];
}

export function isDuplicateKey(error: unknown): boolean {
    return error instanceof ApiError && error.status === 409;
}

export function errorMessage(error: unknown): string {
    if (isDuplicateKey(error)) {
        const key = /"([^"]*)"/.exec((error as ApiError).message)?.[1];
        return key
            ? `Another variant in this group already uses the key “${key}”. Pick a different one.`
            : "Another variant in this group already uses that key. Pick a different one.";
    }
    return error instanceof Error ? error.message : String(error);
}

function sentence(code: string): string {
    const words = code.replace(/[_.-]+/g, " ").trim();
    return words ? words[0].toUpperCase() + words.slice(1) : "Problem";
}

export function genericIssueText(issue: IssueFields): string {
    const details = [
        ...Object.entries(issue.names ?? {}).map(([key, value]) => `${key} ${value}`),
        ...Object.entries(issue.values ?? {})
            .filter((entry): entry is [string, number] => typeof entry[1] === "number")
            .map(([key, value]) => `${key} ${value}`),
    ];
    const head = sentence(issue.code ?? "");
    return details.length ? `${head} (${details.join(", ")})` : head;
}

export function issueText(issue: IssueFields): string {
    return portedIssueText(issue) ?? genericIssueText(issue);
}

const DASHBOARD_CODES = new Set(["manifest_required", "manifest_nested", "kind_mismatch", "bundle_unreadable", "bundle_skipped"]);

export function fixedInBlockbench(issues: readonly Issue[]): boolean {
    return issues.some((issue) => !DASHBOARD_CODES.has(issue.code));
}

export interface UploadOutcome {
    warnings: Issue[];
    analysis: BundleAnalysis | null;
    cosmeticId: number | null;
}

function parseAnalysis(value: unknown): BundleAnalysis | null {
    if (!isRecord(value)) return null;
    const number = (key: string) => (typeof value[key] === "number" ? (value[key] as number) : 0);
    return {
        requires: Array.isArray(value.requires)
            ? value.requires.filter((entry): entry is string => typeof entry === "string")
            : [],
        quads: number("quads"),
        bones: number("bones"),
        spring_bones: number("spring_bones"),
        live_particles: number("live_particles"),
        trail_points: number("trail_points"),
        record_bytes: number("record_bytes"),
        texture_bytes: number("texture_bytes"),
    };
}

export function parseUploadOutcome(response: unknown): UploadOutcome {
    if (!isRecord(response)) return { warnings: [], analysis: null, cosmeticId: null };
    let cosmeticId: number | null = typeof response.cosmetic_id === "number" ? response.cosmetic_id : null;
    if (cosmeticId === null && Array.isArray(response.variants)) {
        const first: unknown = response.variants[0];
        if (isRecord(first) && typeof first.id === "number") cosmeticId = first.id;
    }
    return {
        warnings: parseIssues(response.warnings),
        analysis: parseAnalysis(response.analysis),
        cosmeticId,
    };
}

export function analysisRows(analysis: BundleAnalysis): [string, string][] {
    const rows: [string, string][] = [
        ["Quads", String(analysis.quads)],
        ["Bones", String(analysis.bones)],
        ["Spring bones", String(analysis.spring_bones)],
        ["Live particles", String(Math.round(analysis.live_particles * 100) / 100)],
        ["Trail points", String(analysis.trail_points)],
        ["Record size", formatBytes(analysis.record_bytes)],
        ["Texture size", formatBytes(analysis.texture_bytes)],
    ];
    if (analysis.requires.length) rows.unshift(["Needs", analysis.requires.join(", ")]);
    return rows;
}

const KIB = 1024;
const MIB = 1024 * KIB;

export function formatBytes(bytes: number): string {
    if (bytes >= MIB) return `${(bytes / MIB).toFixed(bytes % MIB ? 1 : 0)} MiB`;
    if (bytes >= KIB) return `${Math.round(bytes / KIB)} KiB`;
    return `${bytes} B`;
}

export interface BundleLimits {
    download: number;
    unpacked: number;
    entries: number;
    perFile?: number;
}

const ITEM_LIMITS: BundleLimits = { download: 8 * MIB, unpacked: 16 * MIB, entries: 64 };

export function bundleLimits(type: string): BundleLimits {
    switch (type) {
        case "cape":
            return { download: 16 * MIB, unpacked: 32 * MIB, entries: 16 };
        case "emote":
            return { download: 8 * MIB, unpacked: 16 * MIB, entries: 128 };
        case "effect":
            return { download: 4 * MIB, unpacked: 8 * MIB, entries: 128 };
        case "nameplate":
            return { download: 2 * MIB, unpacked: 8 * MIB, entries: 128, perFile: MIB };
        default:
            return ITEM_LIMITS;
    }
}

export const MAX_COVER_BYTES = 2 * MIB;
export const MAX_COVER_SIDE = 2048;

export interface BundleEntry {
    name: string;
    size: number;
}

export interface BundleInfo {
    zip: boolean;
    bytes: number;
    entries: BundleEntry[];
    manifest: unknown;
    manifestError: string | null;
}

export const MANIFEST = "manifest.json";

export function isJunkPath(path: string): boolean {
    const segments = path.split("/");
    return segments.at(-1) === ".DS_Store" || segments.includes("__MACOSX");
}

export function isZipBytes(bytes: Uint8Array): boolean {
    return bytes.length >= 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

function parseManifest(bytes: Uint8Array | undefined): Pick<BundleInfo, "manifest" | "manifestError"> {
    if (!bytes) return { manifest: null, manifestError: null };
    try {
        return { manifest: JSON.parse(new TextDecoder().decode(bytes)), manifestError: null };
    } catch {
        return { manifest: null, manifestError: "manifest.json isn't valid JSON." };
    }
}

export function inspectZip(bytes: Uint8Array): BundleInfo {
    const entries: BundleEntry[] = [];
    let files: Record<string, Uint8Array>;
    try {
        files = unzipSync(bytes, {
            filter: (file) => {
                if (!file.name.endsWith("/") && !isJunkPath(file.name)) {
                    entries.push({ name: file.name, size: file.originalSize });
                }
                return file.name === MANIFEST;
            },
        });
    } catch {
        return { zip: true, bytes: bytes.length, entries: [], manifest: null, manifestError: "The zip can't be read." };
    }
    return { zip: true, bytes: bytes.length, entries, ...parseManifest(files[MANIFEST]) };
}

export function inspectFiles(
    files: { name: string; bytes: Uint8Array }[],
    zippedBytes: number,
): BundleInfo {
    const kept = files.filter((file) => !isJunkPath(file.name));
    return {
        zip: true,
        bytes: zippedBytes,
        entries: kept.map((file) => ({ name: file.name, size: file.bytes.length })),
        ...parseManifest(kept.find((file) => file.name === MANIFEST)?.bytes),
    };
}

export function inspectSingle(name: string, bytes: Uint8Array): BundleInfo {
    if (isZipBytes(bytes)) return inspectZip(bytes);
    return { zip: false, bytes: bytes.length, entries: [{ name, size: bytes.length }], manifest: null, manifestError: null };
}

export function hasRootManifest(info: BundleInfo): boolean {
    return info.zip && info.entries.some((entry) => entry.name === MANIFEST);
}

export function manifestVariantKeys(manifest: unknown): string[] {
    if (!isRecord(manifest)) return [];
    const variants = manifest.variants;
    return isRecord(variants) && Object.keys(variants).length ? Object.keys(variants) : ["default"];
}

const MANIFEST_KINDS: Partial<Record<string, string>> = {
    cape: "item",
    backpack: "item",
    glasses: "item",
    wings: "item",
    glove: "item",
    hat: "item",
    aura: "item",
    boots: "item",
    shoulder: "item",
    pet: "pet",
    emote: "emote",
    effect: "effect",
};

export function bundleProblems(type: string, info: BundleInfo): string[] {
    const limits = bundleLimits(type);
    const problems: string[] = [];
    const needsManifest = type === "nameplate" || type === "effect";

    if (needsManifest && !info.zip) {
        problems.push(`A ${type} must be a folder or .zip with ${MANIFEST} at the root.`);
        return problems;
    }
    if (info.bytes > limits.download) {
        problems.push(`It's ${formatBytes(info.bytes)}, and a ${type} can be at most ${formatBytes(limits.download)}.`);
    }
    if (!info.zip) return problems;

    if (info.manifestError) problems.push(info.manifestError);
    if (info.entries.length > limits.entries) {
        problems.push(`It has ${info.entries.length} files, and a ${type} can have at most ${limits.entries}.`);
    }
    const unpacked = info.entries.reduce((sum, entry) => sum + entry.size, 0);
    if (unpacked > limits.unpacked) {
        problems.push(`It unpacks to ${formatBytes(unpacked)}, and a ${type} can unpack to at most ${formatBytes(limits.unpacked)}.`);
    }
    if (limits.perFile !== undefined) {
        const big = info.entries.find((entry) => entry.size > limits.perFile!);
        if (big) problems.push(`${big.name} is ${formatBytes(big.size)}. Each file can be at most ${formatBytes(limits.perFile)}.`);
    }

    const nested = info.entries.find((entry) => entry.name !== MANIFEST && entry.name.endsWith(`/${MANIFEST}`));
    const root = hasRootManifest(info);
    if (!root && nested) {
        problems.push(`${MANIFEST} has to be at the root of the bundle, not at ${nested.name}.`);
    } else if (!root && needsManifest) {
        problems.push(`A ${type} needs ${MANIFEST} at the root.`);
    }

    if (root && isRecord(info.manifest)) {
        if (type === "nameplate" && info.manifest.format !== 1) {
            problems.push(`The manifest says format ${String(info.manifest.format ?? "nothing")}. Nameplates need format 1.`);
        }
        const kind = MANIFEST_KINDS[type];
        if (kind && info.manifest.kind !== kind) {
            problems.push(
                typeof info.manifest.kind === "string" && info.manifest.kind
                    ? `The manifest says kind “${info.manifest.kind}”. A ${type} needs “${kind}”.`
                    : `The manifest has no kind. A ${type} needs “${kind}”.`,
            );
        }
    }
    return problems;
}

export function coverProblems(
    file: { size: number; type?: string; name?: string },
    dimensions?: { width: number; height: number },
): string[] {
    const problems: string[] = [];
    const png = file.type === "image/png" || (file.name ?? "").toLowerCase().endsWith(".png");
    if (!png) problems.push("The cover has to be a PNG.");
    if (file.size > MAX_COVER_BYTES) {
        problems.push(`The cover is ${formatBytes(file.size)}, and covers can be at most ${formatBytes(MAX_COVER_BYTES)}.`);
    }
    if (dimensions) {
        const fits = (side: number) => side >= 1 && side <= MAX_COVER_SIDE;
        if (!fits(dimensions.width) || !fits(dimensions.height)) {
            problems.push(
                `The cover is ${dimensions.width}×${dimensions.height}. Covers can be at most ${MAX_COVER_SIDE}×${MAX_COVER_SIDE}.`,
            );
        }
    }
    return problems;
}

export interface CreateFields {
    type: string;
    name: string;
    description?: string;
    slots: readonly string[];
    group?: string;
    variantName?: string;
    variantOrder?: number;
    modelVariant?: string;
    variantKey?: string;
    coverSeconds?: number | null;
    enabled?: boolean;
    assetFrom?: number;
}

export interface NamedBlob {
    blob: Blob;
    name: string;
}

export function buildCreateForm(fields: CreateFields, file: NamedBlob | null, cover: NamedBlob | null = null): FormData {
    const name = fields.name.trim();
    const group = fields.group?.trim();
    if (fields.type === "effect" && !name && !group) throw new Error("Effects need a name.");
    if (file && fields.assetFrom !== undefined) throw new Error("Send a file or reuse another variant's file, not both.");
    if (!file && fields.assetFrom === undefined) throw new Error("Pick a file first.");
    if (fields.assetFrom !== undefined && fields.type !== "nameplate") {
        throw new Error("Only nameplates can reuse another variant's file.");
    }
    const slotError = validateSlots(fields.type, fields.slots);
    if (slotError) throw new Error(slotError);

    const form = new FormData();
    if (file) form.append("file", file.blob, file.name);
    if (fields.assetFrom !== undefined) form.append("asset_from", String(fields.assetFrom));
    form.append("type", fields.type);
    if (name) form.append("name", name);
    const description = fields.description?.trim();
    if (description) form.append("description", description);
    if (fields.coverSeconds != null) form.append("cover_seconds", String(fields.coverSeconds));
    for (const slot of fields.type === "emote" ? [] : fields.slots) form.append("slots", slot);
    if (group) {
        form.append("group", group);
        const variantName = fields.variantName?.trim();
        if (variantName) form.append("variant_name", variantName);
        if (fields.variantOrder !== undefined) form.append("variant_order", String(fields.variantOrder));
        if (fields.modelVariant) form.append("model_variant", fields.modelVariant);
    }
    const variantKey = fields.variantKey?.trim();
    if (variantKey) form.append("variant_key", variantKey);
    if (fields.enabled !== undefined) form.append("enabled", String(fields.enabled));
    if (cover) form.append("cover", cover.blob, cover.name);
    return form;
}

export function buildReplaceForm(cosmeticId: number, file: NamedBlob): FormData {
    const form = new FormData();
    form.append("cosmetic_id", String(cosmeticId));
    form.append("file", file.blob, file.name);
    return form;
}

export function buildSetCoverForm(cosmeticId: number, cover: NamedBlob, clearPreview: boolean): FormData {
    const form = new FormData();
    form.append("cosmetic_id", String(cosmeticId));
    form.append("file", cover.blob, cover.name);
    if (clearPreview) form.append("clear_preview", "true");
    return form;
}

export interface VariantEdits {
    variantName?: string;
    modelVariant?: string;
    variantOrder?: number;
    variantKey?: string;
    slots?: readonly string[];
}

export function buildVariantUpdate(variant: CatalogCosmetic, edits: VariantEdits): Record<string, unknown> {
    const body: Record<string, unknown> = { cosmetic_id: variant.id };
    if (edits.variantName !== undefined && edits.variantName !== (variant.variant_name ?? "")) {
        body.variant_name = edits.variantName.trim() || null;
    }
    if (edits.modelVariant !== undefined && edits.modelVariant !== (variant.model_variant ?? "")) {
        body.model_variant = edits.modelVariant || null;
    }
    if (edits.variantOrder !== undefined && edits.variantOrder !== variant.variant_order) {
        body.variant_order = edits.variantOrder;
    }
    if (edits.variantKey !== undefined && edits.variantKey.trim() !== (variant.variant_key ?? "")) {
        body.variant_key = edits.variantKey.trim() || null;
    }
    if (edits.slots !== undefined && edits.slots.length > 0) {
        const current = variant.slots;
        const same =
            current !== undefined &&
            current.length === edits.slots.length &&
            edits.slots.every((slot) => current.includes(slot));
        if (!same) body.slots = [...edits.slots];
    }
    return body;
}

export function sharedAssetVariants(variants: readonly CatalogCosmetic[], variant: CatalogCosmetic): CatalogCosmetic[] {
    if (variant.asset_id == null) return [];
    return variants.filter((other) => other.id !== variant.id && other.asset_id === variant.asset_id);
}

interface PublicVariant {
    id: number;
    variant_key?: string;
    allowed_slots?: string[];
}

export function mergePublicVariants(catalog: Catalog, publicList: unknown): Catalog {
    if (!isRecord(publicList) || !Array.isArray(publicList.cosmetics)) return catalog;
    const known = new Map<number, PublicVariant>();
    for (const cosmetic of publicList.cosmetics) {
        if (!isRecord(cosmetic) || !Array.isArray(cosmetic.variants)) continue;
        for (const variant of cosmetic.variants) {
            if (isRecord(variant) && typeof variant.id === "number") known.set(variant.id, variant as unknown as PublicVariant);
        }
    }
    if (!known.size) return catalog;
    return {
        ...catalog,
        cosmetics: catalog.cosmetics.map((cosmetic) => {
            const found = known.get(cosmetic.id);
            if (!found) return cosmetic;
            const merged: CatalogCosmetic = { ...cosmetic };
            if (merged.variant_key === undefined) merged.variant_key = found.variant_key ?? null;
            if (merged.slots === undefined && Array.isArray(found.allowed_slots)) merged.slots = found.allowed_slots;
            return merged;
        }),
    };
}

export function catalogNeedsMerge(catalog: Catalog): boolean {
    return catalog.cosmetics.some((cosmetic) => cosmetic.variant_key === undefined || cosmetic.slots === undefined);
}

export function variantKeyProblems(
    type: string,
    key: string,
    bundleKeys: readonly string[],
    takenKeys: readonly (string | null | undefined)[],
): string[] {
    const trimmed = key.trim();
    if (!trimmed) return [];
    const problems: string[] = [];
    if (type === "nameplate" && bundleKeys.length && !bundleKeys.includes(trimmed)) {
        problems.push(`The bundle has no variant “${trimmed}”. It has ${bundleKeys.join(", ")}.`);
    }
    if (takenKeys.includes(trimmed)) problems.push(`Another variant in this group already uses “${trimmed}”.`);
    return problems;
}

export function needsManualCover(error: unknown): boolean {
    return error instanceof ApiError && error.status === 400 && /set-cover/i.test(error.message);
}
