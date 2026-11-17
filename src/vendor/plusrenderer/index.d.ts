// Vendored from the github.com/Polyfrost/plusrenderer v1.1.0 release (plusrenderer-renderer-1.1.0.tgz).

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
    draw(camera: Camera, seconds: number): { triangles: number; draws: number };
}
