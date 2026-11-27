import type { Nameplates } from "./nameplate.js";

export interface DrawContext {
    tag: number;
    status: number;
    mode: number;
    color: number;
    shadow: number;
    shadowUse: number;
    outline: number;
    letterCount: number;
    plate: [number, number];
    ownsBackground: boolean;
    badge: { visible: boolean; x: number; y: number; opacity: number; tint: number; decorationKind: number; decorationRgb: number };
    row: Int32Array | null;
}

export interface LetterPose {
    dx: number;
    dy: number;
    argb: number;
    shadow: number;
    opacity: number;
    scaleQ: number;
    rotation: number;
    outline: number;
}

export interface DrawTagOptions {
    assetId?: number;
    row?: Int32Array | null;
    transform?: { x?: number; y?: number; scale?: number };
    viewport?: [number, number];
    targetSize?: [number, number] | null;
    text?: (ctx: DrawContext) => void;
    badge?: (ctx: DrawContext) => void;
    background?: (ctx: DrawContext) => void;
}

export function disjointRects(rects: Array<[number, number, number, number]>): Array<[number, number, number, number]>;
export function letterAt(ctx: DrawContext, index: number): LetterPose;

export class NameplateDrawer {
    constructor(gl: WebGL2RenderingContext, nameplates: Nameplates, options?: { light?: number[]; targetSize?: [number, number] | null });
    setLight(rgba: ArrayLike<number>): void;
    setAssetShaders(assetId: number, shaders: unknown): void;
    forgetAsset(assetId: number): void;
    setVanillaTexture(name: string, source: TexImageSource | Uint8Array, width?: number, height?: number): void;
    setTexture(key: string, source: TexImageSource | Uint8Array, width?: number, height?: number): void;
    setAtlas(source: TexImageSource | Uint8Array, width: number, height: number, sprites: Record<string, ArrayLike<number>> | Map<string, ArrayLike<number>> | ((name: string) => ArrayLike<number> | null | undefined) | null): void;
    setBundleTextures(assetId: number, images: Array<{ width: number; height: number; rgba: Uint8Array } | TexImageSource | null>): void;
    drawImage(source: TexImageSource, x: number, y: number, width: number, height: number, tint?: number): void;
    fillRect(x0: number, y0: number, x1: number, y1: number, argb: number): void;
    drawTag(out: Int32Array, tag: number, options?: DrawTagOptions): number;
    dispose(): void;
}
