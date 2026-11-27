import type { BundleFiles, LoadOptions, RawIssue } from "./nameplate.js";

export const KINDS: readonly string[];
export const RIGS: readonly string[];
export const RIG_VALUES: Readonly<Record<"player" | "actor" | "boat" | "minecart" | "horse", number>>;
export const STATUSES: readonly string[];
export const ENGINE_CAPABILITIES: readonly string[];
export const HOST_CAPABILITIES: readonly string[];
export const AUTHORING_CAPABILITIES: readonly string[];
export const NO_COLORWAY: number;
export const TEXTURE_INFO_INTS: number;
export const SECTION_INTS: number;
export const INPUT_LAYOUT_INTS: number;
export const SECTION_NAMES: readonly string[];
export const INPUT_LAYOUT_NAMES: readonly string[];

export interface RendererExports {
    readonly memory: WebAssembly.Memory;
    alloc(len: number): number;
    dealloc(ptr: number, len: number): void;
    renderer_new(): number;
    renderer_free(r: number): void;
    renderer_error(r: number): number;
    renderer_error_len(r: number): number;
    renderer_set_rig(r: number, kind: number): number;
    renderer_set_physics(r: number, mode: number, own: bigint): number;
    renderer_load_asset(r: number, slot: number, asset: number): number;
    renderer_load_emote(r: number, slot: number, props: number, asset: number): number;
    renderer_load_player(r: number, slot: number, slim: number): void;
    renderer_is_animating(r: number): number;
    renderer_has_effects(r: number): number;
    renderer_effect_geometry(r: number, view: number, viewLen: number, out: number, outLen: number): number;
    renderer_effect_texture_count(r: number): number;
    renderer_effect_texture(r: number, id: number, slotOut: number, pathOut: number, pathLen: number): number;
    renderer_set_effect_colors(r: number, wearer: bigint, colorway: number, slots: number, rgb: number, count: number): number;
    renderer_play(r: number, slot: number, at: number): void;
    renderer_play_f64(r: number, slot: number, at: number): void;
    renderer_stop(r: number, slot: number): void;
    renderer_forget_wearer(r: number, wearer: bigint): number;
    renderer_set_signal_override(r: number, wearer: bigint, signal: number, value: number): number;
    renderer_fire_effect(r: number, wearer: bigint, name: number, nameLen: number): number;
    renderer_effect_events(r: number, out: number, outLen: number): number;
    renderer_effect_event_floats(r: number, out: number, outLen: number): number;
    renderer_host_variable_id(r: number, name: number, nameLen: number): number;
    renderer_output_layout(r: number, sections: number, sectionsLen: number, out: number, outLen: number): number;
    renderer_frame_wearers_shaped(r: number, clock: number, wearers: number, wearerCount: number, sections: number, sectionsLen: number, input: number, inputLen: number, space: number, out: number, outLen: number): number;
}

export type CosmeticStatus = "asset" | "draft" | "skipped" | "invalid" | "legacy";

export interface RawCosmeticReaction {
    signal: string | null;
    signal_index: number;
    on: "start" | "stop" | "while" | "appear" | "equip";
    play: string | null;
    restart: boolean;
    blend: number;
    speed: number | null;
    colorway: string | null;
    effect: string | null;
}

export interface RawCosmeticMeta {
    id: string;
    identity: string;
    kind: string;
    requires: string[];
    attach: { rig: string; bone: string | null; replaces: string | null; anchor: string | null };
    model: { identifier: string; bones: number; locators: string[] } | null;
    textures: Array<{ name: string; width: number; height: number; indexed: boolean }>;
    palette: { slots: Array<{ id: string; name: string; customizable: boolean }>; colorways: string[] };
    animations: string[];
    controllers: string[];
    reactions: RawCosmeticReaction[];
    spring_bones: number;
    effects: {
        particles: Array<{ id: string; texture: string }>;
        sounds: Array<{ id: string; file: string | null; vanilla: string | null; volume: number; pitch: number }>;
        emitters: number;
        trails: Array<{ texture: string }>;
        named: string[];
        moments?: Array<{ name: string; clip: number | null; seconds: number }>;
        locators: string[];
    };
    pet: { archetype: string; leash_radius: number; scale: number; anchor: string | null; controllers: string[]; interactions: Record<string, Array<"a" | "b">> } | null;
    roles: Array<{ id: string; interaction?: string; animation: string | null; offset: [number, number, number]; yaw: number }>;
    rules: Record<string, boolean> | null;
    requirement?: string;
    fallback?: string | null;
}

export interface RawCosmeticAnalysis {
    requires: string[];
    quads: number;
    bones: number;
    spring_bones: number;
    live_particles: number;
    trail_points: number;
    record_bytes: number;
    texture_bytes: number;
}

export type CustomColors = Array<[number, number]> | Map<number, number> | Record<number, number>;

export class CosmeticAsset {
    readonly handle: number;
    readonly status: CosmeticStatus;
    readonly issues: RawIssue[];
    readonly skip: { format?: number; requires?: string[] } | null;
    readonly legacy: { files: string[] } | null;
    readonly usable: boolean;
    meta(): RawCosmeticMeta | null;
    analyze(): RawCosmeticAnalysis | null;
    textureCount(): number;
    textureInfo(index: number): { width: number; height: number; indexed: boolean; bytes: number };
    resolveTexture(index: number, options?: { colorway?: number; custom?: CustomColors }): Uint8Array;
    textureKey(index: number, options?: { colorway?: number; custom?: CustomColors }): bigint;
    live(): number;
    free(): void;
}

export class CosmeticEngine {
    static create(source?: URL | string | ArrayBuffer | Uint8Array): Promise<CosmeticEngine>;
    constructor(wasm: WebAssembly.Exports | RendererExports);
    readonly wasm: WebAssembly.Exports;
    parse(source: BundleFiles | Uint8Array | ArrayBuffer, options?: LoadOptions): CosmeticAsset;
    constants(): { limits: Record<string, number> };
    inputLayout(sections: Record<string, number | boolean> | ArrayLike<number>): Record<string, number>;
    pairSeed(a: bigint | number, b: bigint | number, minute: number): bigint;
    actorWearer(owner: bigint | number, slot: number): bigint;
    eventWearer(owner: bigint | number, event: number, seq: number, nonce?: number): bigint;
}

export function parseCosmetic(engine: CosmeticEngine | { wasm: WebAssembly.Exports } | WebAssembly.Exports, source: BundleFiles | Uint8Array | ArrayBuffer, options?: LoadOptions): CosmeticAsset;
