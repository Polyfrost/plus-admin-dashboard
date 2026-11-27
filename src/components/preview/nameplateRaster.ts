import {
    NameplateEngine,
    OUT,
    blendPixel,
    flattenRasterLayers,
    startClock,
    tagRow,
    type LayerBlend,
    type NameplateAsset,
    type Nameplates,
    type RasterLetter,
} from "@/vendor/plusrenderer/nameplate.js";
import { issueText } from "@/lib/cosmetics-api";
import { standInArt, type HostTextureKind } from "./standInTextures";

const ADVANCE = 6;
const GLYPH = 5;
export const COVER_SCALE = 6;
export const PREVIEW_NAME = "Player";

let shared: Promise<NameplateEngine> | null = null;
export function nameplateEngine(): Promise<NameplateEngine> {
    shared ??= NameplateEngine.create();
    shared.catch(() => (shared = null));
    return shared;
}

const WEARER = 0n;
const LONGEST_ONE_SHOT = 600;
const SEEN_SECONDS = 0.5;
export const TEXT_CACHE = 512;
const MASK64 = (1n << 64n) - 1n;
const GAMMA = 0x9e3779b97f4a7c15n;
const FRAME_LIMIT = 2 ** 23;
const clock = startClock();

interface TextRecord {
    plates: Nameplates;
    slot: number;
    frame: number | null;
    start: number;
}

interface FrameText {
    frame: number;
    observedFor: number;
    look: TextLook;
}

export interface HostTexture {
    kind: HostTextureKind;
    name: string;
}

export interface Nameplate {
    asset: NameplateAsset;
    meta: NameplateAsset["meta"];
    seed: bigint;
    records: Map<number, TextRecord>;
    texts: Map<string, FrameText>;
    standIns: HostTexture[];
    missing: string[];
    texturesBlank: boolean;
    textureNote: string | null;
    free(): void;
}

interface ShaderSampler {
    texture: { kind: "bundle"; index: number } | { kind: HostTextureKind; name: string };
}

export function hostTextures(asset: NameplateAsset): HostTexture[] {
    if (!(asset.meta.layers ?? []).some((layer) => layer.content === "material")) return [];
    const found = new Map<string, HostTexture>();
    for (const shader of asset.shaders("es_300").shaders as Array<{ samplers: ShaderSampler[] }>) {
        for (const { texture } of shader.samplers) {
            if (texture.kind !== "bundle" && !found.has(texture.name)) found.set(texture.name, { kind: texture.kind, name: texture.name });
        }
    }
    return [...found.values()];
}

function feedStandIns(textures: HostTexture[], set: (name: string, width: number, height: number, rgba: Uint8Array) => void) {
    const fed: HostTexture[] = [];
    const missing: string[] = [];
    for (const texture of textures) {
        try {
            const art = standInArt(texture.kind, texture.name);
            set(texture.name, art.width, art.height, art.rgba);
            fed.push(texture);
        } catch {
            missing.push(texture.name);
        }
    }
    return { fed, missing };
}

const UNREAD_TEXTURES = "Couldn't tell which game textures this nameplate uses, so layers drawn from them may be blank here.";

function textureNote(fed: HostTexture[], missing: string[]): string | null {
    if (missing.length) return `Couldn't draw the game textures ${missing.join(", ")}, so the layers that use them are blank here.`;
    if (fed.length) {
        return `Game textures use placeholder art here: ${fed.map((t) => t.name).join(", ")}. In game, players see their own resource pack.`;
    }
    return null;
}

const mix64 = (value: bigint) => {
    let z = value & MASK64;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK64;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK64;
    return z ^ (z >> 31n);
};

export function wearerSeed(wearer: bigint, identity: bigint): bigint {
    const h = mix64(wearer + GAMMA);
    const g = mix64(h ^ ((identity + GAMMA * 2n) & MASK64));
    return mix64(g ^ ((GAMMA * 3n) & MASK64));
}

export function loadNameplate(engine: NameplateEngine, files: Record<string, Uint8Array>): Nameplate {
    const asset = engine.loadSync(files, { mode: "client" });
    if (!asset.usable) {
        const issue = asset.issues.find((i) => i.level === "error");
        asset.free();
        throw new Error(issue ? issueText(issue) : "This nameplate can't be previewed");
    }
    let wanted: HostTexture[] | null;
    try {
        wanted = hostTextures(asset);
    } catch {
        wanted = null;
    }
    const { fed, missing } = feedStandIns(wanted ?? [], (name, width, height, rgba) =>
        engine.setRasterTexture(name, width, height, rgba),
    );
    const records = new Map<number, TextRecord>();
    return {
        asset,
        meta: asset.meta,
        seed: wearerSeed(WEARER, BigInt(asset.meta.identity ?? 0)),
        records,
        texts: new Map(),
        standIns: fed,
        missing,
        texturesBlank: !wanted || missing.length > 0,
        textureNote: wanted ? textureNote(fed, missing) : UNREAD_TEXTURES,
        free() {
            for (const record of records.values()) record.plates.free();
            records.clear();
            asset.free();
        },
    };
}

export function nameplateKeys(plate: Nameplate): string[] {
    return (plate.meta.variants ?? []).map((v) => v.key);
}

export function variantOf(plate: Nameplate, key: string | null): number {
    return key && nameplateKeys(plate).includes(key) ? plate.asset.variantIndex(key) : 0;
}

function glyphsOf(name: string): Float32Array {
    const glyphs = new Float32Array(name.length * OUT.GLYPH_FLOATS);
    for (let i = 0; i < name.length; i++) {
        glyphs[i * OUT.GLYPH_FLOATS] = i * ADVANCE;
        glyphs[i * OUT.GLYPH_FLOATS + 1] = GLYPH;
    }
    return glyphs;
}

function rowOf(asset: number, variant: number, name: string): Int32Array {
    const width = name.length * ADVANCE - 1;
    return tagRow({ asset, variant, nameWidth: width, lines: [width], glyphCount: name.length });
}

const LETTER_KEEP = 0;
const LETTER_OFF = 1;
const TEXT_KEEP = 0;
const SHADOW_ALWAYS = 2;
const WHITE = 0xffffff;
const HALF_WIDTH = ADVANCE / 2;
const HALF_HEIGHT = 4;
const DECORATION = 1;
const OUTLINE_OFFSETS: Array<[number, number]> = [
    [-1, -1],
    [0, -1],
    [1, -1],
    [-1, 0],
    [1, 0],
    [-1, 1],
    [0, 1],
    [1, 1],
];

export interface TextLook {
    color: number;
    shadow: number | null;
    outline: number | null;
}

export const PLAIN_TEXT: TextLook = { color: WHITE, shadow: null, outline: null };

export interface RawText {
    color: number;
    shadow: number;
    shadowUse: number;
    outline: number;
}

export interface LetterLook extends TextLook {
    dx: number;
    dy: number;
    opacity: number;
    scale: number;
    rotation: number;
}

export const shadowOf = (rgb: number) => (rgb & 0xfcfcfc) >>> 2;

export function textLook(text: RawText | null): TextLook {
    if (!text) return PLAIN_TEXT;
    const color = text.color === TEXT_KEEP ? WHITE : text.color & WHITE;
    if (text.outline !== TEXT_KEEP) return { color, shadow: null, outline: text.outline & WHITE };
    const shadow = text.shadowUse === SHADOW_ALWAYS && text.shadow !== TEXT_KEEP ? text.shadow & WHITE : null;
    return { color, shadow, outline: null };
}

export function readText(out: Int32Array): RawText | null {
    const dir = OUT.OUT_HEADER;
    if (out.length < dir + OUT.DIR_WORDS) return null;
    const at = out[dir + OUT.DIR_OFFSET];
    const length = out[dir + OUT.DIR_LEN];
    if (out[dir + OUT.DIR_STATUS] !== OUT.STATUS_OK || length < OUT.TAG_HEAD || at + length > out.length) return null;
    const textAt = at + OUT.TAG_HEAD + out[at + OUT.HEAD_OPS] * OUT.OP_WORDS + out[at + OUT.HEAD_MATERIAL_WORDS];
    if (textAt + OUT.TEXT_FIXED > at + length) return null;
    return {
        color: out[textAt + OUT.TEXT_COLOR] >>> 0,
        shadow: out[textAt + OUT.TEXT_SHADOW] >>> 0,
        shadowUse: out[textAt + OUT.TEXT_SHADOW_USE],
        outline: out[textAt + OUT.TEXT_OUTLINE] >>> 0,
    };
}

export function letterLook(letter: RasterLetter | null, base: TextLook = PLAIN_TEXT, owned = true): LetterLook {
    const placed = {
        dx: letter?.dx ?? 0,
        dy: letter?.dy ?? 0,
        opacity: letter?.opacity ?? 255,
        scale: 1,
        rotation: 0,
    };
    if (!letter || !owned) return { ...placed, ...base };
    const color = letter.color !== LETTER_KEEP ? letter.color & WHITE : base.color;
    const outline =
        letter.outline === LETTER_KEEP ? base.outline : letter.outline === LETTER_OFF ? null : letter.outline & WHITE;
    let shadow: number | null;
    if (outline !== null || letter.shadow === LETTER_OFF) shadow = null;
    else if (letter.shadow !== LETTER_KEEP) shadow = letter.shadow & WHITE;
    else if (base.shadow !== null && base.shadow === shadowOf(base.color)) shadow = shadowOf(color);
    else shadow = base.shadow;
    return {
        ...placed,
        scale: letter.scale > 0 ? letter.scale : 1,
        rotation: letter.rotation,
        color,
        shadow,
        outline,
    };
}

export interface RasterImage {
    width: number;
    height: number;
    origin: [number, number];
    data: Uint8ClampedArray;
}

export interface BandLayer {
    blend: LayerBlend;
    passes: Uint8ClampedArray[];
}

export interface RasterBand {
    width: number;
    height: number;
    origin: [number, number];
    layers: BandLayer[];
}

export interface PlateFrame {
    under: RasterImage;
    over: RasterBand | null;
    looks: LetterLook[];
}

function hasPixels(data: Uint8ClampedArray): boolean {
    for (let i = 3; i < data.length; i += 4) if (data[i] !== 0) return true;
    return false;
}

const warmupOf = (plate: Nameplate) => LONGEST_ONE_SHOT + (plate.meta.fps || 1);

export function wrapPeriod(loopFrames: number): number {
    const period = Math.max(1, Math.floor(loopFrames) || 1);
    return Math.floor((FRAME_LIMIT - 1) / period) * period;
}

export function utcFrame(plate: Nameplate, seconds: number = clock()): number {
    const fps = plate.meta.fps || 1;
    return Math.floor((Math.floor(seconds * 1000) * fps) / 1000);
}

export function engineFrame(plate: Nameplate, frame: number): number {
    const period = wrapPeriod(plate.meta.loop_frames ?? 1);
    return ((Math.floor(frame) % period) + period) % period;
}

export const coverFrame = (plate: Nameplate) => warmupOf(plate);

function recordOf(plate: Nameplate, variant: number, frame: number): TextRecord {
    const known = plate.records.get(variant);
    if (known && known.frame !== null && known.frame < frame && frame - known.frame <= warmupOf(plate)) return known;
    if (known) {
        plate.records.delete(variant);
        known.plates.free();
    }
    const plates = plate.asset.engine.nameplates();
    let record: TextRecord;
    try {
        feedStandIns(plate.standIns, (name, width, height, rgba) => plates.setVanillaTexture(name, width, height, rgba));
        record = { plates, slot: plates.addAsset(plate.asset), frame: null, start: frame };
    } catch (error) {
        plates.free();
        throw error;
    }
    plate.records.set(variant, record);
    return record;
}

function frameText(plate: Nameplate, variant: number, name: string, shown: number): FrameText {
    const frame = Math.floor(shown);
    const key = `${variant}|${frame}|${name}`;
    const known = plate.texts.get(key);
    if (known) return known;
    const fps = plate.meta.fps || 1;
    const record = recordOf(plate, variant, frame);
    const row = rowOf(record.slot, variant, name);
    const glyphs = glyphsOf(name);
    const signals = new Float32Array(OUT.SIGNAL_FLOATS);
    const draw = (at: number) => record.plates.frame((at + 0.5) / fps, [WEARER], row, signals, glyphs);
    let at = record.frame;
    if (at === null) {
        draw(frame + 1);
        at = frame;
    }
    const stride = Math.max(1, Math.floor(SEEN_SECONDS * fps));
    while (at + stride < frame) {
        at += stride;
        draw(at);
    }
    const shownAt = engineFrame(plate, frame);
    const text: FrameText = {
        frame: shownAt,
        observedFor: Math.min(frame - record.start, shownAt),
        look: textLook(readText(draw(frame))),
    };
    record.frame = frame;
    plate.texts.set(key, text);
    while (plate.texts.size > TEXT_CACHE) plate.texts.delete(plate.texts.keys().next().value as string);
    return text;
}

export function frameAt(plate: Nameplate, variant: number, name: string, frame: number): PlateFrame {
    const text = frameText(plate, variant, name, frame);
    const row = rowOf(0, variant, name);
    const shot = plate.asset.rasterLayers(row, text.frame, {
        glyphs: glyphsOf(name),
        seed: plate.seed,
        observedFor: text.observedFor,
    });
    const { width, height, origin } = shot;
    const under = flattenRasterLayers(
        shot.layers.filter((layer) => layer.band === "under_text"),
        new Uint8ClampedArray(width * height * 4),
    );
    const layers = shot.layers
        .filter((layer) => layer.band === "over_text" && layer.passes.some(hasPixels))
        .map((layer) => ({ blend: layer.blend, passes: layer.passes }));
    const owned = shot.textMode === "owned";
    const [px, py] = shot.plate;
    const looks = Array.from(name, (_, i) => {
        const look = letterLook(shot.textMode === "vanilla" ? null : (shot.letters[i] ?? null), text.look, owned);
        return { ...look, dx: look.dx + px, dy: look.dy + py };
    });
    return {
        under: { width, height, origin, data: under },
        over: layers.length ? { width, height, origin, layers } : null,
        looks,
    };
}

const argbAt = (data: Uint8ClampedArray, at: number) =>
    (data[at + 3] * 0x1000000 + (data[at] << 16) + (data[at + 1] << 8) + data[at + 2]) >>> 0;

export function compositeBand(target: Uint8ClampedArray, band: RasterBand, scale: number) {
    const stride = band.width * scale;
    for (let y = 0; y < band.height; y++) {
        for (let x = 0; x < band.width; x++) {
            const at = (y * band.width + x) * 4;
            if (!band.layers.some((layer) => layer.passes.some((pass) => pass[at + 3]))) continue;
            for (let sy = 0; sy < scale; sy++) {
                for (let sx = 0; sx < scale; sx++) {
                    const i = ((y * scale + sy) * stride + x * scale + sx) * 4;
                    let color = argbAt(target, i);
                    for (const layer of band.layers) {
                        for (const pass of layer.passes) color = blendPixel(argbAt(pass, at), color, layer.blend);
                    }
                    target[i] = (color >>> 16) & 0xff;
                    target[i + 1] = (color >>> 8) & 0xff;
                    target[i + 2] = color & 0xff;
                    target[i + 3] = color >>> 24;
                }
            }
        }
    }
}

export interface Bounds {
    x0: number;
    y0: number;
    x1: number;
    y1: number;
}

export function letterBounds(look: LetterLook, index: number): Bounds {
    const cx = index * ADVANCE + look.dx + HALF_WIDTH;
    const cy = look.dy + HALF_HEIGHT;
    const hx = HALF_WIDTH + DECORATION;
    const hy = HALF_HEIGHT + DECORATION;
    const angle = (look.rotation * Math.PI) / 180;
    const cos = Math.abs(Math.cos(angle));
    const sin = Math.abs(Math.sin(angle));
    const ex = look.scale * (cos * hx + sin * hy);
    const ey = look.scale * (sin * hx + cos * hy);
    return { x0: Math.floor(cx - ex), y0: Math.floor(cy - ey), x1: Math.ceil(cx + ex), y1: Math.ceil(cy + ey) };
}

const imageBounds = (image: RasterImage | RasterBand): Bounds => ({
    x0: image.origin[0],
    y0: image.origin[1],
    x1: image.origin[0] + image.width,
    y1: image.origin[1] + image.height,
});

export function plateBounds(shot: PlateFrame): Bounds {
    const all = [imageBounds(shot.under)];
    if (shot.over) all.push(imageBounds(shot.over));
    shot.looks.forEach((look, i) => look.opacity > 0 && all.push(letterBounds(look, i)));
    return all.reduce((a, b) => ({
        x0: Math.min(a.x0, b.x0),
        y0: Math.min(a.y0, b.y0),
        x1: Math.max(a.x1, b.x1),
        y1: Math.max(a.y1, b.y1),
    }));
}

const css = (rgb: number) => `#${rgb.toString(16).padStart(6, "0")}`;

export function paint(target: HTMLCanvasElement, shot: PlateFrame, name: string, scale: number) {
    const ctx = target.getContext("2d", { willReadFrequently: true })!;
    const bounds = plateBounds(shot);
    const width = (bounds.x1 - bounds.x0) * scale;
    const height = (bounds.y1 - bounds.y0) * scale;
    if (target.width !== width || target.height !== height) {
        target.width = width;
        target.height = height;
    }
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, width, height);
    const layer = (image: RasterImage) => {
        if (!image.width || !image.height) return;
        const plate = new OffscreenCanvas(image.width, image.height);
        plate.getContext("2d")!.putImageData(new ImageData(new Uint8ClampedArray(image.data), image.width, image.height), 0, 0);
        ctx.drawImage(
            plate,
            (image.origin[0] - bounds.x0) * scale,
            (image.origin[1] - bounds.y0) * scale,
            image.width * scale,
            image.height * scale,
        );
    };
    layer(shot.under);
    const x0 = -bounds.x0 * scale;
    const y0 = -bounds.y0 * scale;
    ctx.font = `bold ${8 * scale}px monospace`;
    ctx.textBaseline = "top";
    for (let i = 0; i < name.length; i++) {
        const look = shot.looks[i];
        if (!look || look.opacity <= 0) continue;
        ctx.save();
        ctx.globalAlpha = look.opacity / 255;
        ctx.translate(x0 + (i * ADVANCE + look.dx + HALF_WIDTH) * scale, y0 + (look.dy + HALF_HEIGHT) * scale);
        if (look.rotation) ctx.rotate((look.rotation * Math.PI) / 180);
        if (look.scale !== 1) ctx.scale(look.scale, look.scale);
        const draw = (rgb: number, dx: number, dy: number) => {
            ctx.fillStyle = css(rgb);
            ctx.fillText(name[i], (dx - HALF_WIDTH) * scale, (dy - HALF_HEIGHT) * scale, ADVANCE * scale);
        };
        if (look.outline !== null) for (const [dx, dy] of OUTLINE_OFFSETS) draw(look.outline, dx, dy);
        if (look.shadow !== null) draw(look.shadow, 1, 1);
        draw(look.color, 0, 0);
        ctx.restore();
    }
    const over = shot.over;
    if (over && over.width && over.height) {
        const x = (over.origin[0] - bounds.x0) * scale;
        const y = (over.origin[1] - bounds.y0) * scale;
        const pixels = ctx.getImageData(x, y, over.width * scale, over.height * scale);
        compositeBand(pixels.data, over, scale);
        ctx.putImageData(pixels, x, y);
    }
}

export function coverPng(plate: Nameplate, variant: number, name = PREVIEW_NAME, frame = coverFrame(plate)): Promise<Blob> {
    const target = document.createElement("canvas");
    paint(target, frameAt(plate, variant, name, frame), name, COVER_SCALE);
    return new Promise((resolve, reject) =>
        target.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Could not save the picture"))), "image/png"),
    );
}
