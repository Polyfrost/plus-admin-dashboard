// Vendored from the github.com/Polyfrost/plusrenderer v1.1.0 release (plusrenderer-renderer-1.1.0.tgz).

import type { RendererExports } from "./cosmetic.js";

type Image = TexImageSource & { width: number; height: number };

export const defaultWasmUrl: URL;
export const PREVIEW_WEARER: bigint;
export const EFFECT_EVENT_INTS: number;
export const EFFECT_PARTICLE: number;
export const EFFECT_SOUND: number;
export const MOTION_FULL: number;
export const MOTION_REDUCED: number;
export const MOTION_OFF: number;
export const SLOTS: number;

export interface ControllerFile {
    name: string;
    bytes: string | ArrayBuffer | Uint8Array;
}

export interface Camera {
    yaw: number;
    pitch: number;
    distance: number;
    targetY: number;
}

export class Renderer {
    static create(canvas: HTMLCanvasElement, wasmUrl?: URL | string): Promise<Renderer>;
    readonly canvas: HTMLCanvasElement;
    readonly gl: WebGL2RenderingContext;
    readonly wasm: RendererExports;
    readonly handle: number;
    dirty: boolean;
    animating: boolean;
    check(code: number): void;
    loadPlayer(slot: number, slim: boolean): void;
    loadCosmetic(slot: number, json: string, bodySlot: string, image: Image, anchor?: string): void;
    loadCape(slot: number, still: Image, sheet?: Image | null, sheetName?: string): void;
    loadElytra(slot: number, still: Image, sheet?: Image | null, sheetName?: string): void;
    loadAnimation(slot: number, json: string): void;
    /** Indices into `paths` of [geometry, animation, texture, cape sheet], or -1. */
    bundleParts(paths: string[]): [number, number, number, number];
    play(slot: number, at: number): void;
    stop(slot: number): void;
    /** `fall` is how steeply it dives, 0..1. */
    setElytraPose(slot: number, pose: "standing" | "crouching" | "flying", fall?: number): void;
    setVisible(slot: number, visible: boolean): void;
    clear(slot: number): void;
    setTexture(slot: number, image: Image): void;
    loadControllers(slot: number, json: string, files: ControllerFile[], declared?: string[]): void;
    bundleControllers(paths: string[]): number[];
    effectEvents(): Uint32Array;
    controllerState(slot: number, controller: number, wearer?: bigint | number): { state: string; seconds: number } | null;
    setLightLevel(level: number): void;
    setSignalOverride(signal: number, value: number, wearer?: bigint | number): void;
    setMotion(motion: number): void;
    forgetWearer(wearer: bigint | number): boolean;
    setSeedWearer(wearer: bigint | number, seedWearer: bigint | number): void;
    wearerCount(): number;
    wearerBytes(): number;
    resize(scale?: number): [number, number];
    draw(camera: Camera, seconds: number): { triangles: number; draws: number };
}
