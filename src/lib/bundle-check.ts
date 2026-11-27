import { unzipSync, zipSync } from "fflate";
import { AUTHORING_CAPABILITIES, CosmeticEngine, type RawCosmeticAnalysis, type RawCosmeticMeta } from "@/vendor/plusrenderer/cosmetic.js";
import { instantiate, NameplateEngine, type NameplateAsset, type WasmSource } from "@/vendor/plusrenderer/nameplate.js";
import { isJunkPath, type EffectContent, type Issue } from "./cosmetics-api";
import { issueLevel } from "./issue-text";

export type BundleStatus = "valid" | "invalid" | "legacy";

export interface RawIssue {
    code: string;
    level: "error" | "warning" | "info";
    path: string;
    values: Record<string, number | null>;
    names: Record<string, string>;
}

export interface NameplateLayerAnalysis {
    id: string;
    states: number;
    image_bytes: number;
    quads: number;
    cpu_units: number;
    margin: number;
}

export interface NameplateEffectAnalysis {
    layer: string;
    states: number;
    shot_states: number;
    tone_slots: number;
    reads: string[];
    build_ops: number;
}

export interface NameplateAnalysis {
    requires: string[];
    quads: number;
    cpu_units: number;
    image_bytes: number;
    fallback_bytes: number;
    record_bytes: number;
    max_out_words: number;
    material_build_ops: number;
    layers: NameplateLayerAnalysis[];
    effects: NameplateEffectAnalysis[];
}

export type CosmeticAnalysis = RawCosmeticAnalysis;

export interface BundleReport {
    status: BundleStatus;
    issues: Issue[];
    analysis?: CosmeticAnalysis | NameplateAnalysis;
    variantKeys?: string[];
    colorways?: string[];
    kind?: string;
    effects?: string[];
    effectContent?: EffectContent;
}

export type BundleInput = File | File[] | Blob | ArrayBuffer | Uint8Array | Record<string, Uint8Array | string>;

interface Engines {
    cosmetics: CosmeticEngine;
    nameplates: NameplateEngine;
}

let source: WasmSource | undefined;
let engines: Promise<Engines> | null = null;

export function setEngineSource(next: WasmSource | undefined) {
    source = next;
    engines = null;
}

function loadEngines(): Promise<Engines> {
    engines ??= instantiate(source).then((wasm) => ({
        cosmetics: new CosmeticEngine(wasm),
        nameplates: new NameplateEngine(wasm),
    }));
    engines.catch(() => (engines = null));
    return engines;
}

const MANIFEST = "manifest.json";
const NEEDS_MANIFEST = new Set(["nameplate", "effect"]);
const KINDS: Record<string, string> = { emote: "emote", pet: "pet", effect: "effect" };

function expectedKind(type: string): string | null {
    if (type === "cape") return null;
    return KINDS[type] ?? "item";
}

const isZip = (bytes: Uint8Array) => bytes[0] === 0x50 && bytes[1] === 0x4b;

const relativePath = (file: File) =>
    (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name;

interface Prepared {
    zip: Uint8Array | null;
    names: string[];
}

function zipOf(files: Record<string, Uint8Array>): Prepared {
    const kept = Object.fromEntries(Object.entries(files).filter(([name]) => !isJunkPath(name) && !name.endsWith("/")));
    return { zip: zipSync(kept), names: Object.keys(kept) };
}

function fromBytes(bytes: Uint8Array, name: string): Prepared {
    if (!isZip(bytes)) return { zip: null, names: [name] };
    let entries: Record<string, Uint8Array>;
    try {
        entries = unzipSync(bytes);
    } catch {
        return { zip: bytes, names: [] };
    }
    const names = Object.keys(entries).filter((entry) => !entry.endsWith("/"));
    if (names.some(isJunkPath)) return zipOf(entries);
    return { zip: bytes, names };
}

async function prepare(input: BundleInput): Promise<Prepared> {
    if (input instanceof Uint8Array) return fromBytes(input, "file");
    if (input instanceof ArrayBuffer) return fromBytes(new Uint8Array(input), "file");
    if (input instanceof Blob) {
        const name = input instanceof File ? input.name : "file";
        return fromBytes(new Uint8Array(await input.arrayBuffer()), name);
    }
    if (Array.isArray(input)) {
        if (input.length === 1 && !relativePath(input[0]).includes("/")) return prepare(input[0]);
        const encoded = await Promise.all(
            input.map(async (file) => {
                const segments = relativePath(file).split("/");
                const inner = segments.length > 1 ? segments.slice(1).join("/") : file.name;
                return [inner, new Uint8Array(await file.arrayBuffer())] as const;
            }),
        );
        return zipOf(Object.fromEntries(encoded));
    }
    const encoder = new TextEncoder();
    return zipOf(
        Object.fromEntries(
            Object.entries(input).map(([name, data]) => [name, typeof data === "string" ? encoder.encode(data) : data]),
        ),
    );
}

function toIssue(raw: RawIssue): Issue {
    const values: Record<string, number> = {};
    for (const [key, value] of Object.entries(raw.values ?? {})) {
        if (typeof value === "number" && Number.isFinite(value)) values[key] = value;
    }
    const names: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw.names ?? {})) {
        if (typeof value === "string") names[key] = value;
    }
    return { code: String(raw.code ?? ""), level: issueLevel(raw), path: String(raw.path ?? ""), values, names };
}

function local(code: string, path: string, names: Record<string, string> = {}, values: Record<string, number> = {}): Issue {
    return { code, level: "error", path, values, names };
}

function skipped(skip: { format?: number; requires?: string[] } | null): Issue {
    const values: Record<string, number> = skip?.format != null ? { format: skip.format } : {};
    const names: Record<string, string> = skip?.requires?.length ? { requires: skip.requires.join(", ") } : {};
    return local("bundle_skipped", `${MANIFEST}#requires`, names, values);
}

function message(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function settle(report: Omit<BundleReport, "status">, legacy: boolean): BundleReport {
    const failed = report.issues.some((issue) => issue.level === "error");
    return { ...report, status: failed ? "invalid" : legacy ? "legacy" : "valid" };
}

function dialectIssues(asset: NameplateAsset): RawIssue[] {
    try {
        return asset.dialectIssues("es_300").issues;
    } catch {
        return [];
    }
}

function checkNameplate(engine: NameplateEngine, zip: Uint8Array): BundleReport {
    const asset = engine.loadSync(zip, { mode: "authoring" });
    try {
        const issues = (asset.issues as RawIssue[]).map(toIssue);
        if (asset.kind === "skipped") issues.push(skipped(asset.skip as Parameters<typeof skipped>[0]));
        if (asset.kind === "invalid" && !issues.some((issue) => issue.level === "error")) {
            issues.push(local("bundle_unreadable", MANIFEST));
        }
        const analysis: NameplateAnalysis | undefined = asset.usable ? asset.analyze() : undefined;
        if (asset.usable) issues.push(...dialectIssues(asset).map(toIssue));
        const variantKeys = (asset.meta.variants ?? []).map((variant) => variant.key);
        return settle({ issues, analysis, variantKeys, kind: "nameplate" }, false);
    } finally {
        asset.free();
    }
}

function effectContentOf(meta: RawCosmeticMeta): EffectContent {
    const effects = meta.effects;
    return {
        trails: (effects.trails?.length ?? 0) > 0,
        moments: (effects.named?.length ?? 0) > 0 || (effects.moments?.length ?? 0) > 0,
    };
}

function checkCosmetic(engine: CosmeticEngine, type: string, zip: Uint8Array): BundleReport {
    const asset = engine.parse(zip, { mode: "authoring", capabilities: AUTHORING_CAPABILITIES });
    try {
        const issues = asset.issues.map(toIssue);
        if (asset.status === "skipped") issues.push(skipped(asset.skip));
        if (asset.status === "invalid" && !issues.some((issue) => issue.level === "error")) {
            issues.push(local("bundle_unreadable", MANIFEST));
        }
        const meta = asset.meta();
        const expected = expectedKind(type);
        if (meta && expected && meta.kind !== expected) {
            issues.push(local("kind_mismatch", `${MANIFEST}#kind`, { kind: meta.kind, type }));
        }
        return settle(
            {
                issues,
                analysis: asset.analyze() ?? undefined,
                colorways: meta?.palette.colorways,
                effects: meta?.effects.named,
                effectContent: meta ? effectContentOf(meta) : undefined,
                kind: meta?.kind,
            },
            asset.status === "legacy",
        );
    } finally {
        asset.free();
    }
}

export async function checkBundle(type: string, files: BundleInput): Promise<BundleReport> {
    const prepared = await prepare(files);
    const nested = prepared.names.find((name) => name !== MANIFEST && name.endsWith(`/${MANIFEST}`));
    const rooted = prepared.names.includes(MANIFEST);

    if (!prepared.zip) {
        return NEEDS_MANIFEST.has(type)
            ? settle({ issues: [local("manifest_required", "", { type })] }, false)
            : settle({ issues: [] }, true);
    }
    if (nested) return settle({ issues: [local("manifest_nested", "", { file: nested })] }, false);
    if (!rooted && prepared.names.length && NEEDS_MANIFEST.has(type)) {
        return settle({ issues: [local("manifest_required", "", { type })] }, false);
    }

    const { cosmetics, nameplates } = await loadEngines();
    try {
        return type === "nameplate" ? checkNameplate(nameplates, prepared.zip) : checkCosmetic(cosmetics, type, prepared.zip);
    } catch (error) {
        return settle({ issues: [local("bundle_unreadable", "", { error: message(error) })] }, false);
    }
}

export function blocksUpload(report: BundleReport): boolean {
    return report.status === "invalid";
}
