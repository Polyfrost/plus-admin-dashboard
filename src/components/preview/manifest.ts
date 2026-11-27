import { AUTHORING_CAPABILITIES, CosmeticEngine, NO_COLORWAY, type CosmeticAsset, type RawCosmeticMeta } from "@/vendor/plusrenderer/cosmetic.js";
import { SIGNALS } from "@/vendor/plusrenderer/nameplate.js";
import { EVENT_EQUIP, EVENT_JUMP, NEUTRAL_SIGNALS } from "@/vendor/plusrenderer/preview.js";
import { issueText } from "@/lib/cosmetics-api";

export interface PaletteSlot {
    id: string;
    name: string;
}

export interface ManifestInfo {
    kind: string;
    colorways: string[];
    customSlots: PaletteSlot[];
    effects: string[];
    signals: string[];
}

type MetaLike = Pick<RawCosmeticMeta, "kind" | "reactions"> & {
    palette?: RawCosmeticMeta["palette"];
    effects?: { named?: string[]; moments?: Array<{ name: string }> };
};

export const HOST_SIGNALS: readonly string[] = SIGNALS;

export const isToggleSignal = (name: string) => name.startsWith("is_");

export const neutralSignal = (name: string): number => NEUTRAL_SIGNALS[name] ?? 0;

const SIGNAL_READ = /\b(?:q|query)\.(?:owner\.)?([a-z_]+)/g;

function cosmeticError(asset: CosmeticAsset): Error {
    const issue = asset.issues.find((i) => i.level === "error");
    if (issue) return new Error(issueText(issue));
    if (asset.status === "skipped") return new Error("This version of the engine can't show this bundle");
    return new Error("This bundle can't be previewed");
}

export function inspectManifest(wasm: ConstructorParameters<typeof CosmeticEngine>[0], files: Record<string, Uint8Array>): { kind: string; rig: string } {
    const asset = new CosmeticEngine(wasm).parse(files, { mode: "client", capabilities: AUTHORING_CAPABILITIES });
    try {
        const meta = asset.usable ? asset.meta() : null;
        if (!meta) throw cosmeticError(asset);
        return { kind: meta.kind, rig: meta.attach?.rig ?? "player" };
    } finally {
        asset.free();
    }
}

export function effectNames(meta: MetaLike | undefined): string[] {
    const names = [...(meta?.effects?.named ?? []), ...(meta?.effects?.moments ?? []).map((moment) => moment.name)];
    return [...new Set(names)];
}

export function readSignals(meta: MetaLike, files: Record<string, Uint8Array> = {}): string[] {
    const found = new Set<string>();
    for (const reaction of meta.reactions ?? []) if (reaction.signal) found.add(reaction.signal);
    const decoder = new TextDecoder();
    for (const [path, bytes] of Object.entries(files)) {
        if (!path.toLowerCase().endsWith(".json")) continue;
        for (const match of decoder.decode(bytes).matchAll(SIGNAL_READ)) {
            if (HOST_SIGNALS.includes(match[1])) found.add(match[1]);
        }
    }
    const order = (name: string) => {
        const at = HOST_SIGNALS.indexOf(name);
        return at < 0 ? HOST_SIGNALS.length : at;
    };
    return [...found].sort((a, b) => order(a) - order(b) || a.localeCompare(b));
}

export function manifestInfo(meta: MetaLike, files?: Record<string, Uint8Array>): ManifestInfo {
    return {
        kind: meta.kind,
        colorways: meta.palette?.colorways ?? [],
        customSlots: (meta.palette?.slots ?? []).filter((s) => s.customizable).map(({ id, name }) => ({ id, name })),
        effects: effectNames(meta),
        signals: readSignals(meta, files),
    };
}

export function colorwayIndex(meta: MetaLike, colorway: string | null | undefined): number {
    const index = colorway ? (meta.palette?.colorways ?? []).indexOf(colorway) : -1;
    return index < 0 ? NO_COLORWAY : index;
}

export function customPairs(meta: MetaLike, custom: Record<string, number> | undefined): Array<[number, number]> {
    const slots = meta.palette?.slots ?? [];
    const pairs: Array<[number, number]> = [];
    for (const [id, rgb] of Object.entries(custom ?? {})) {
        const index = slots.findIndex((s) => s.id === id && s.customizable);
        if (index >= 0) pairs.push([index, rgb & 0xffffff]);
    }
    return pairs;
}

export interface Paint {
    colorway: number;
    custom: Array<[number, number]> | null;
}

export function paintOf(meta: MetaLike, colorway: string | null | undefined, custom?: Record<string, number>): Paint {
    const pairs = customPairs(meta, custom);
    return { colorway: colorwayIndex(meta, colorway), custom: pairs.length ? pairs : null };
}

export function petOptions(
    meta: MetaLike,
    files: Record<string, Uint8Array>,
    colorway: string | null | undefined,
    custom?: Record<string, number>,
): Paint & { files: Record<string, Uint8Array> } {
    return { files, ...paintOf(meta, colorway, custom) };
}

export const PREVIEW_PULSES: ReadonlyArray<{ label: string; event: number }> = [
    { label: "Jump", event: EVENT_JUMP },
    { label: "Wear again", event: EVENT_EQUIP },
];

export const UNSET_CUSTOM_COLOR = 0xffffff;

export const hexColor = (rgb: number) => `#${(rgb & 0xffffff).toString(16).padStart(6, "0")}`;

export function parseHexColor(hex: string): number | null {
    return /^#[0-9a-f]{6}$/i.test(hex) ? parseInt(hex.slice(1), 16) : null;
}

function argbOf(value: unknown): number | null {
    if (typeof value !== "string" || !/^#(?:[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value)) return null;
    const parsed = parseInt(value.slice(1), 16);
    return value.length === 7 ? (parsed | 0xff000000) >>> 0 : parsed >>> 0;
}

function lerpArgb(from: number, to: number, num: number, den: number): number {
    let out = 0;
    for (const shift of [24, 16, 8, 0]) {
        const a = Math.floor(from / 2 ** shift) & 0xff;
        const b = Math.floor(to / 2 ** shift) & 0xff;
        out += Math.min(255, Math.max(0, a + Math.floor(((b - a) * num) / den))) * 2 ** shift;
    }
    return out;
}

function along(stops: number[], position: number, positions: number): number {
    if (stops.length === 1 || positions <= 1) return stops[0];
    const segments = stops.length - 1;
    const span = positions - 1;
    const scaled = Math.min(position, positions - 1) * segments;
    const segment = Math.min(Math.floor(scaled / span), segments - 1);
    return lerpArgb(stops[segment], stops[segment + 1], scaled - segment * span, span);
}

function rampOf(value: unknown, interpolate: unknown): number[] | null {
    if (!Array.isArray(value) || !value.length) return null;
    const stops = value.map(argbOf);
    if (stops.some((stop) => stop === null)) return null;
    const known = stops as number[];
    const count = typeof interpolate === "number" && Number.isInteger(interpolate) ? interpolate : 0;
    if (known.length < 2 || count <= known.length) return known;
    return Array.from({ length: count }, (_, i) => along(known, i, count));
}

export function slotBaseColors(files: Record<string, Uint8Array>, colorway?: string | null): Record<string, number> {
    const bytes = files["palettes.json"];
    if (!bytes) return {};
    let palette: { slots?: unknown; colorways?: Record<string, Record<string, unknown>> };
    try {
        palette = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
        return {};
    }
    const overrides = (colorway && palette?.colorways?.[colorway]) || {};
    const bases: Record<string, number> = {};
    for (const slot of Array.isArray(palette?.slots) ? palette.slots : []) {
        if (!slot || typeof slot.id !== "string") continue;
        const ramp = rampOf(overrides[slot.id] ?? slot.ramp, slot.interpolate);
        if (ramp) bases[slot.id] = ramp[Math.floor((ramp.length - 1) / 2)] & 0xffffff;
    }
    return bases;
}

export function withCustomColor(current: Record<string, number>, id: string, hex: string): Record<string, number> {
    const rgb = parseHexColor(hex);
    return rgb === null ? current : { ...current, [id]: rgb };
}
