// Vendored from github.com/Polyfrost/plusrenderer @ 1b8585c (packages/renderer, wasm via
// scripts/build-wasm.sh). Swap for the release tgz once one is published.

type Image = TexImageSource & { width: number; height: number };

export interface Camera {
    yaw: number;
    pitch: number;
    distance: number;
    targetY: number;
}

export class Renderer {
    static create(canvas: HTMLCanvasElement, wasmUrl?: URL | string): Promise<Renderer>;
    loadPlayer(slot: number, slim: boolean): void;
    loadCosmetic(slot: number, json: string, bodySlot: string, image: Image, anchor?: string): void;
    loadCape(slot: number, still: Image, sheet?: Image | null, sheetName?: string): void;
    loadAnimation(slot: number, json: string): void;
    /** Indices into `paths` of [geometry, animation, texture, cape sheet], or -1. */
    bundleParts(paths: string[]): [number, number, number, number];
    play(slot: number, at: number): void;
    stop(slot: number): void;
    setVisible(slot: number, visible: boolean): void;
    clear(slot: number): void;
    setTexture(slot: number, image: Image): void;
    draw(camera: Camera, seconds: number): { triangles: number; draws: number };
}
