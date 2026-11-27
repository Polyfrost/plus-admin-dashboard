import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, test } from "vitest";
import { NameplateEngine, OUT, flattenRasterLayers, tagRow, type RasterLetter } from "@/vendor/plusrenderer/nameplate.js";
import {
    TEXT_CACHE,
    compositeBand,
    coverFrame,
    engineFrame,
    frameAt,
    letterBounds,
    letterLook,
    loadNameplate,
    plateBounds,
    textLook,
    utcFrame,
    variantOf,
    wrapPeriod,
    type Nameplate,
    type PlateFrame,
    type RasterBand,
    type RasterImage,
    type TextLook,
} from "./nameplateRaster";

const pose = (over: Partial<RasterLetter> = {}): RasterLetter => ({
    dx: 0,
    dy: 0,
    color: 0,
    shadow: 0,
    opacity: 255,
    scale: 1,
    rotation: 0,
    outline: 0,
    ...over,
});

const red: TextLook = { color: 0xff0000, shadow: 0x3f0000, outline: null };

describe("letterLook", () => {
    test("plain text is white with no shadow, like a vanilla name tag", () => {
        expect(letterLook(null)).toEqual({
            dx: 0,
            dy: 0,
            opacity: 255,
            scale: 1,
            rotation: 0,
            color: 0xffffff,
            shadow: null,
            outline: null,
        });
    });

    test("a kept letter takes the bundle's text style", () => {
        expect(letterLook(pose(), red)).toMatchObject(red);
        expect(letterLook(null, { color: 0x00ff00, shadow: null, outline: 0x101010 })).toMatchObject({
            color: 0x00ff00,
            shadow: null,
            outline: 0x101010,
        });
    });

    test("keeps the pose's offset, opacity, scale and rotation", () => {
        const look = letterLook(pose({ dx: 2, dy: -3, opacity: 128, scale: 1.5, rotation: 90 }));
        expect(look).toMatchObject({ dx: 2, dy: -3, opacity: 128, scale: 1.5, rotation: 90 });
    });

    test("moving text only moves and fades letters", () => {
        const look = letterLook(pose({ dx: 2, opacity: 100, color: 0xff00ff00, scale: 2, rotation: 45 }), red, false);
        expect(look).toMatchObject({ ...red, dx: 2, opacity: 100, scale: 1, rotation: 0 });
    });

    test("a recoloured letter gets a matching shadow when the base shadow is the derived one", () => {
        expect(letterLook(pose({ color: 0xff00ff00 }), red)).toMatchObject({ color: 0x00ff00, shadow: 0x003f00 });
        const picked: TextLook = { color: 0xff0000, shadow: 0x123456, outline: null };
        expect(letterLook(pose({ color: 0xff00ff00 }), picked)).toMatchObject({ color: 0x00ff00, shadow: 0x123456 });
    });

    test("shadow can be set or turned off", () => {
        expect(letterLook(pose({ shadow: 0xff123456 })).shadow).toBe(0x123456);
        expect(letterLook(pose({ shadow: 1 }), red).shadow).toBeNull();
    });

    test("an outline replaces the shadow", () => {
        expect(letterLook(pose({ outline: 0xffabcdef, shadow: 0xff123456 }))).toMatchObject({ outline: 0xabcdef, shadow: null });
        expect(letterLook(pose({ outline: 1 }), { color: 0, shadow: null, outline: 0x222222 }).outline).toBeNull();
    });

    test("a zero scale falls back to normal size", () => {
        expect(letterLook(pose({ scale: 0 })).scale).toBe(1);
    });
});

describe("textLook", () => {
    test("keeps the host colour and shadow when the bundle leaves them", () => {
        expect(textLook({ color: 0, shadow: 0, shadowUse: 0, outline: 0 })).toEqual({ color: 0xffffff, shadow: null, outline: null });
    });

    test("uses the resolved colour, shadow and outline", () => {
        expect(textLook({ color: 0xffff0000, shadow: 0xff112233, shadowUse: 2, outline: 0 })).toEqual({
            color: 0xff0000,
            shadow: 0x112233,
            outline: null,
        });
        expect(textLook({ color: 0xffff0000, shadow: 0, shadowUse: 1, outline: 0xff000000 })).toEqual({
            color: 0xff0000,
            shadow: null,
            outline: 0,
        });
    });

    test("a shadow that needs a drop shadow stays off on a name tag", () => {
        expect(textLook({ color: 0xffffffff, shadow: 0xff1a1a1a, shadowUse: 3, outline: 0 }).shadow).toBeNull();
    });
});

describe("bounds", () => {
    const image = (x: number, y: number, width: number, height: number): RasterImage => ({
        width,
        height,
        origin: [x, y],
        data: new Uint8ClampedArray(width * height * 4),
    });

    test("a plain letter fits its cell plus the shadow or outline pixel", () => {
        expect(letterBounds(letterLook(null), 1)).toEqual({ x0: 5, y0: -1, x1: 13, y1: 9 });
    });

    test("a rotated, scaled letter grows its box", () => {
        const box = letterBounds(letterLook(pose({ scale: 2, rotation: 90 })), 0);
        expect(box).toEqual({ x0: -7, y0: -4, x1: 13, y1: 12 });
    });

    test("letters moved past the raster widen the canvas", () => {
        const shot: PlateFrame = {
            under: image(-2, -1, 20, 10),
            over: { width: 4, height: 4, origin: [-4, 0], layers: [] },
            looks: [letterLook(pose({ dy: -30 })), letterLook(pose({ dx: 40 }))],
        };
        expect(plateBounds(shot)).toEqual({ x0: -4, y0: -31, x1: 53, y1: 9 });
    });

    test("hidden letters don't count", () => {
        const shot: PlateFrame = { under: image(0, 0, 10, 10), over: null, looks: [letterLook(pose({ dx: 40, opacity: 0 }))] };
        expect(plateBounds(shot)).toEqual({ x0: 0, y0: 0, x1: 10, y1: 10 });
    });
});

describe("compositeBand", () => {
    const rgba = (r: number, g: number, b: number, a: number, count = 1) =>
        Uint8ClampedArray.from({ length: count * 4 }, (_, i) => [r, g, b, a][i % 4]);
    const band = (blend: "alpha" | "additive", data: Uint8ClampedArray): RasterBand => ({
        width: 1,
        height: 1,
        origin: [0, 0],
        layers: [{ blend, passes: [data] }],
    });

    test("an additive front layer adds onto what is already drawn", () => {
        const target = rgba(0, 255, 0, 255, 4);
        compositeBand(target, band("additive", rgba(255, 0, 0, 255)), 2);
        expect(Array.from(target)).toEqual(Array.from(rgba(255, 255, 0, 255, 4)));
    });

    test("a half-strength additive glow keeps the colour under it", () => {
        const glow = rgba(255, 0, 0, 128);
        const added = rgba(0, 0, 255, 255);
        compositeBand(added, band("additive", glow), 1);
        expect(Array.from(added)).toEqual([128, 0, 255, 255]);
        const covered = rgba(0, 0, 255, 255);
        compositeBand(covered, band("alpha", glow), 1);
        expect(Array.from(covered)).toEqual([128, 0, 127, 255]);
    });

    test("layers stack in order and clear pixels leave the canvas alone", () => {
        const target = Uint8ClampedArray.from([10, 20, 30, 255, 0, 0, 255, 255]);
        compositeBand(
            target,
            {
                width: 2,
                height: 1,
                origin: [0, 0],
                layers: [
                    { blend: "alpha", passes: [Uint8ClampedArray.from([0, 0, 0, 0, 0, 255, 0, 255])] },
                    { blend: "additive", passes: [Uint8ClampedArray.from([0, 0, 0, 0, 255, 0, 0, 255])] },
                ],
            },
            1,
        );
        expect(Array.from(target)).toEqual([10, 20, 30, 255, 255, 255, 0, 255]);
    });

    test("each pass of a layer blends onto the canvas in turn", () => {
        const target = rgba(0, 255, 0, 255);
        const half = rgba(255, 0, 0, 128);
        compositeBand(target, { width: 1, height: 1, origin: [0, 0], layers: [{ blend: "additive", passes: [half, half] }] }, 1);
        expect(Array.from(target)).toEqual([255, 255, 0, 255]);
    });
});

describe("engine frames", () => {
    let engine: NameplateEngine;
    const encoder = new TextEncoder();
    const bundle = (manifest: Record<string, unknown>, extra: Record<string, unknown> = {}) =>
        Object.fromEntries(
            Object.entries({
                "manifest.json": {
                    format: 1,
                    kind: "nameplate",
                    id: "plate",
                    requires: ["nameplate"],
                    fps: 6,
                    loop: 12,
                    layers: [{ id: "body" }],
                    ...manifest,
                },
                "palettes.json": {
                    slots: [
                        { id: "fill", name: "Fill", ramp: ["#202020"] },
                        { id: "ink", ramp: ["#FF0000"] },
                        { id: "lid", ramp: ["#00FF00"] },
                    ],
                },
                "layers/body.json": { kind: "body", padding: [2, 1, 2, 1], fill: { color: "fill" } },
                ...extra,
            }).map(([path, value]) => [path, encoder.encode(JSON.stringify(value))]),
        );

    const NOW = 1_764_000_000.123;
    const shotAt = (plate: Nameplate, variant: number, name: string, frame: number) =>
        frameAt(plate, variant, name, utcFrame(plate, NOW) + frame);

    const flat = (image: RasterImage | RasterBand | null): RasterImage | null =>
        image && "layers" in image
            ? {
                  ...image,
                  data: flattenRasterLayers(
                      image.layers.map((layer) => ({ ...layer, data: layer.passes[0] })),
                      new Uint8ClampedArray(image.width * image.height * 4),
                  ),
              }
            : image;

    const colors = (band: RasterImage | RasterBand | null) => {
        const found = new Set<number>();
        const image = flat(band);
        if (!image) return found;
        for (let i = 0; i < image.data.length; i += 4) {
            if (image.data[i + 3] === 255) found.add((image.data[i] << 16) | (image.data[i + 1] << 8) | image.data[i + 2]);
        }
        return found;
    };

    beforeAll(async () => {
        engine = await NameplateEngine.create(readFileSync(new URL("../../vendor/plusrenderer/plusrenderer.wasm", import.meta.url)));
    });

    test("the name takes the bundle's text colour", () => {
        const plate = loadNameplate(engine, bundle({ text: { color: "ink" } }));
        try {
            const shot = shotAt(plate, variantOf(plate, null), "Player", 0);
            expect(shot.looks.every((look) => look.color === 0xff0000)).toBe(true);
        } finally {
            plate.free();
        }
    });

    test("a plain bundle keeps white text", () => {
        const plate = loadNameplate(engine, bundle({}));
        try {
            expect(shotAt(plate, 0, "Ab", 3).looks.map((look) => look.color)).toEqual([0xffffff, 0xffffff]);
        } finally {
            plate.free();
        }
    });

    test("front layers are kept apart so they draw over the name", () => {
        const plate = loadNameplate(
            engine,
            bundle(
                { layers: [{ id: "body" }, { id: "lid", depth: "over_text" }] },
                { "layers/lid.json": { kind: "body", padding: [1, 0, 1, 0], fill: { color: "lid" } } },
            ),
        );
        try {
            const shot = shotAt(plate, 0, "Player", 0);
            expect(colors(shot.under).has(0x202020)).toBe(true);
            expect(colors(shot.under).has(0x00ff00)).toBe(false);
            expect(colors(shot.over).has(0x00ff00)).toBe(true);
            expect(colors(shot.over).has(0x202020)).toBe(false);
        } finally {
            plate.free();
        }
    });

    test("a plate with no front layers has no front band", () => {
        const plate = loadNameplate(engine, bundle({}));
        try {
            expect(shotAt(plate, 0, "Player", 0).over).toBeNull();
        } finally {
            plate.free();
        }
    });

    const pixels = (band: RasterImage | RasterBand | null) => {
        const found: Array<[number, number, number, number]> = [];
        const image = flat(band);
        if (!image) return found;
        for (let i = 0; i < image.data.length; i += 4) {
            if (image.data[i + 3]) found.push([image.data[i], image.data[i + 1], image.data[i + 2], image.data[i + 3]]);
        }
        return found;
    };

    const bodyColor = (shot: PlateFrame) => {
        const found = colors(shot.under);
        expect(found.size).toBe(1);
        return [...found][0];
    };

    const shared = (extra: Record<string, unknown> = {}) =>
        bundle(
            {
                requires: ["nameplate", "nameplate_palette_animation"],
                phase: "per_player",
                text: { color: "ink" },
                animations: {
                    loop: { tracks: { "palette.ink": { keys: [[0, "#FF0000"], [3, "#0000FF"], [6, "#00FF00"], [9, "#FFFF00"]] } } },
                },
                ...extra,
            },
            { "layers/body.json": { kind: "body", padding: [2, 1, 2, 1], fill: { color: "ink" } } },
        );

    test("a per-player plate's body and name use the same moment of its animation", () => {
        const plate = loadNameplate(engine, shared());
        try {
            for (let frame = 0; frame < 12; frame++) {
                const shot = shotAt(plate, 0, "Player", frame);
                expect(shot.looks[0].color).toBe(bodyColor(shot));
            }
        } finally {
            plate.free();
        }
    });

    test("switching variants doesn't play the equip animation into the name colour", () => {
        const plate = loadNameplate(
            engine,
            shared({
                requires: ["nameplate", "nameplate_palette_animation", "nameplate_one_shots"],
                variants: { a: {}, b: {} },
                animations: {
                    loop: { tracks: { "palette.ink": { keys: [[0, "#FF0000"], [6, "#0000FF"]] } } },
                    pop: { trigger: "equip", length: 12, tracks: { "palette.ink": { keys: [[0, "#FFFFFF"]] } } },
                },
            }),
        );
        try {
            for (let frame = 0; frame < 12; frame++) {
                for (const key of ["a", "b", "a"]) {
                    const shot = shotAt(plate, variantOf(plate, key), "Player", frame);
                    expect(shot.looks[0].color).toBe(bodyColor(shot));
                }
            }
        } finally {
            plate.free();
        }
    });

    test("a variant that swaps a back layer for a front one draws it over the name", () => {
        const plate = loadNameplate(
            engine,
            bundle(
                {
                    layers: [{ id: "body" }, { id: "top" }, { id: "lid", depth: "over_text" }],
                    variants: { plain: {}, raised: { swap: { top: "lid" }, hide: ["lid"] } },
                },
                {
                    "layers/top.json": { kind: "body", padding: [1, 0, 1, 0], fill: { color: "ink" } },
                    "layers/lid.json": { kind: "body", padding: [1, 0, 1, 0], fill: { color: "lid" } },
                },
            ),
        );
        try {
            const plain = shotAt(plate, variantOf(plate, "plain"), "Player", 0);
            expect(colors(plain.under).has(0xff0000)).toBe(true);
            expect(colors(plain.over).has(0x00ff00)).toBe(true);
            const raised = shotAt(plate, variantOf(plate, "raised"), "Player", 0);
            expect(colors(raised.under).has(0x00ff00)).toBe(false);
            expect(colors(raised.under).has(0xff0000)).toBe(false);
            expect(colors(raised.over).has(0x00ff00)).toBe(true);
        } finally {
            plate.free();
        }
    });

    const clipped = () =>
        bundle(
            {
                requires: ["nameplate", "nameplate_materials", "nameplate_masks"],
                text: { color: "ink" },
                layers: [
                    { id: "back", depth: "background", mask: "front" },
                    { id: "front", depth: "over_text" },
                    { id: "alt", depth: "over_text", mask: "front" },
                ],
                variants: { plain: { hide: ["alt"] }, swapped: { hide: ["alt"], swap: { back: "alt" } } },
            },
            {
                "palettes.json": { slots: [{ id: "ink", ramp: ["#FFFFFF"] }, { id: "blue", ramp: ["#800000FF"] }] },
                "materials/red.json": solid([1, 0, 0, 1]),
                "materials/green.json": solid([0, 1, 0, 1]),
                "layers/back.json": { kind: "material", material: "red" },
                "layers/front.json": { kind: "body", padding: [2, 1, 2, 1], fill: { color: "blue" } },
                "layers/alt.json": { kind: "material", material: "green" },
            },
        );

    const solid = (color: number[]) => ({
        resolution: "pixel",
        margins: [4, 4, 4, 4],
        nodes: [{ id: "out", type: "Output", in: { color } }],
    });

    const scheduled = () =>
        bundle({
            requires: ["nameplate", "nameplate_schedules"],
            loop: 6,
            animations: {
                blink: {
                    schedule: { id: "blink", window: 18, jitter: 3, chance: 0.5 },
                    length: 9,
                    tracks: { body: { opacity: [[0, 0.5]] } },
                },
            },
        });

    const bodyAlpha = (shot: PlateFrame) => {
        const found = new Set(pixels(shot.under).map(([, , , a]) => a));
        expect(found.size).toBe(1);
        return [...found][0];
    };

    test("schedules keep going past the first loop", () => {
        const plate = loadNameplate(engine, scheduled());
        try {
            const seen = Array.from({ length: 18 * 24 }, (_, frame) => bodyAlpha(shotAt(plate, 0, "Player", frame)));
            expect(new Set(seen).size).toBe(2);
            expect(seen.some((alpha, frame) => alpha !== seen[frame % 6])).toBe(true);
        } finally {
            plate.free();
        }
    });

    test("a one-frame loop still gets a new frame every tick", () => {
        const plate = loadNameplate(engine, bundle({ loop: 1 }));
        try {
            expect(engineFrame(plate, 1)).toBe(engineFrame(plate, 0) + 1);
            expect(engineFrame(plate, 7)).toBe(engineFrame(plate, 0) + 7);
        } finally {
            plate.free();
        }
    });

    test("going back in time replays the name from the start", () => {
        const plate = loadNameplate(engine, shared());
        try {
            const forward = Array.from({ length: 60 }, (_, frame) => shotAt(plate, 0, "Player", frame).looks[0].color);
            for (let i = 0; i < TEXT_CACHE; i++) shotAt(plate, 0, "Player", 1000 + i);
            for (const frame of [59, 3, 40, 0]) {
                const shot = shotAt(plate, 0, "Player", frame);
                expect(shot.looks[0].color).toBe(forward[frame]);
                expect(shot.looks[0].color).toBe(bodyColor(shot));
            }
        } finally {
            plate.free();
        }
    });

    test("letters move with the plate", () => {
        const still = loadNameplate(engine, bundle({}));
        const moved = loadNameplate(
            engine,
            bundle({ animations: { loop: { tracks: { $plate: { position: [[0, [3, 8]]] } } } } }),
        );
        const drawn = (image: RasterImage) => {
            const box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };
            for (let y = 0; y < image.height; y++) {
                for (let x = 0; x < image.width; x++) {
                    if (!image.data[(y * image.width + x) * 4 + 3]) continue;
                    box.x0 = Math.min(box.x0, x + image.origin[0]);
                    box.y0 = Math.min(box.y0, y + image.origin[1]);
                    box.x1 = Math.max(box.x1, x + image.origin[0] + 1);
                    box.y1 = Math.max(box.y1, y + image.origin[1] + 1);
                }
            }
            return box;
        };
        try {
            const a = shotAt(still, 0, "Player", 0);
            const b = shotAt(moved, 0, "Player", 0);
            const body = drawn(a.under);
            expect(drawn(b.under)).toEqual({ x0: body.x0 + 3, y0: body.y0 + 8, x1: body.x1 + 3, y1: body.y1 + 8 });
            const bounds = plateBounds(b);
            b.looks.forEach((look, i) => {
                expect([look.dx, look.dy]).toEqual([a.looks[i].dx + 3, a.looks[i].dy + 8]);
                const letter = letterBounds(look, i);
                expect(letter.y1).toBeLessThanOrEqual(bounds.y1);
                expect(letter.x1).toBeLessThanOrEqual(bounds.x1);
            });
        } finally {
            still.free();
            moved.free();
        }
    });

    const glow = (color: number[], blend: "alpha" | "additive", body = "#00FF00", mirror = false) =>
        bundle(
            {
                requires: ["nameplate", "nameplate_materials", "nameplate_masks"],
                layers: [{ id: "body" }, { id: "glow", depth: "over_text", mask: "body" }],
            },
            {
                "palettes.json": { slots: [{ id: "fill", ramp: [body] }] },
                "materials/glow.json": {
                    resolution: "pixel",
                    margins: [4, 4, 4, 4],
                    nodes: [{ id: "out", type: "Output", in: { color }, set: { blend } }],
                },
                "layers/glow.json": { kind: "material", material: "glow", ...(mirror ? { mirror: true } : {}) },
            },
        );

    const plateRow = (variant: number, name: string) => {
        const glyphs = new Float32Array(name.length * OUT.GLYPH_FLOATS);
        for (let i = 0; i < name.length; i++) {
            glyphs[i * OUT.GLYPH_FLOATS] = i * 6;
            glyphs[i * OUT.GLYPH_FLOATS + 1] = 5;
        }
        const width = name.length * 6 - 1;
        return { glyphs, row: tagRow({ asset: 0, variant, nameWidth: width, lines: [width], glyphCount: name.length }) };
    };

    const wholeRaster = (plate: Nameplate, variant: number, name: string, frame: number) => {
        const { row, glyphs } = plateRow(variant, name);
        return plate.asset.raster(row, engineFrame(plate, frame), { glyphs, seed: plate.seed }).data;
    };

    test("the front band drawn over the back band matches the whole plate", () => {
        const name = "Player";
        const cases = [
            glow([1, 0, 0, 0.5], "additive", "#0000FF"),
            glow([1, 0, 0, 0.5], "alpha"),
            glow([1, 0, 0, 0.5], "additive", "#00FF00", true),
            glow([1, 0, 0, 0.25], "alpha", "#00FF00", true),
            clipped(),
        ];
        for (const files of cases) {
            const plate = loadNameplate(engine, files);
            try {
                for (let variant = 0; variant < (plate.meta.variants?.length || 1); variant++) {
                    const frame = utcFrame(plate, NOW);
                    const shot = frameAt(plate, variant, name, frame);
                    const drawn = new Uint8ClampedArray(shot.under.data);
                    if (shot.over) compositeBand(drawn, shot.over, 1);
                    expect(Array.from(drawn)).toEqual(Array.from(wholeRaster(plate, variant, name, frame)));
                }
            } finally {
                plate.free();
            }
        }
    });

    test("frames follow the UTC clock like the game", () => {
        const cases: Array<[number, number, number, number]> = [
            [1_764_000_000_123, 24, 12, 7_124_402],
            [1_764_000_000_123, 6, 600, 5_975_400],
            [1_795_564_800_000, 10, 20, 4_044_000],
            [41_667, 24, 12, 1000],
        ];
        for (const [ms, fps, loop, expected] of cases) {
            const plate = loadNameplate(engine, bundle({ fps, loop }));
            try {
                expect(engineFrame(plate, utcFrame(plate, ms / 1000))).toBe(expected);
            } finally {
                plate.free();
            }
        }
        expect(wrapPeriod(12)).toBe(8_388_600);
        const plate = loadNameplate(engine, bundle({ fps: 24, loop: 12 }));
        try {
            expect(engineFrame(plate, wrapPeriod(12) + 5)).toBe(5);
            const now = Math.floor((Date.now() * 24) / 1000);
            expect(Math.abs(utcFrame(plate) - now)).toBeLessThanOrEqual(2);
        } finally {
            plate.free();
        }
    });

    test("previews opened at different times show the same frame", () => {
        for (const files of [shared(), scheduled()]) {
            const early = loadNameplate(engine, files);
            const late = loadNameplate(engine, files);
            try {
                const start = utcFrame(early, NOW);
                for (let frame = 0; frame < 40; frame++) frameAt(early, 0, "Player", start + frame);
                for (const frame of [start + 40, start + 41, start + 90]) {
                    const a = frameAt(early, 0, "Player", frame);
                    const b = frameAt(late, 0, "Player", frame);
                    expect(a.looks).toEqual(b.looks);
                    expect(Array.from(a.under.data)).toEqual(Array.from(b.under.data));
                }
            } finally {
                early.free();
                late.free();
            }
        }
    });

    test("a long gap starts the name over instead of replaying it", () => {
        const plate = loadNameplate(engine, shared());
        const fresh = loadNameplate(engine, shared());
        try {
            const start = utcFrame(plate, NOW);
            frameAt(plate, 0, "Player", start);
            const later = start + 6 * 60 * 60 * 24 * 10;
            const shot = frameAt(plate, 0, "Player", later);
            expect(shot.looks).toEqual(frameAt(fresh, 0, "Player", later).looks);
        } finally {
            plate.free();
            fresh.free();
        }
    });

    const leftmost = (image: RasterImage) => {
        for (let x = 0; x < image.width; x++) {
            for (let y = 0; y < image.height; y++) if (image.data[(y * image.width + x) * 4 + 3]) return x + image.origin[0];
        }
        return null;
    };

    test("a fresh preview counts an unchanged signal's time from when it was first shown", () => {
        const files = bundle({
            animations: {
                loop: { tracks: { body: { position: [[0, ["q.is_sneaking_time < 5 ? 0 : 16", 0]]] } } },
            },
        });
        const still = loadNameplate(engine, bundle({}));
        const timed = loadNameplate(engine, files);
        try {
            const start = utcFrame(timed, NOW);
            expect(start).toBeGreaterThan(6 * 60 * 60 * 24 * 365);
            const body = leftmost(frameAt(still, 0, "Player", start).under);
            expect(body).not.toBeNull();
            for (const frame of [0, 1, 29]) expect(leftmost(frameAt(timed, 0, "Player", start + frame).under)).toBe(body);
            for (const frame of [31, 60, 600]) expect(leftmost(frameAt(timed, 0, "Player", start + frame).under)).toBe(body! + 16);
        } finally {
            still.free();
            timed.free();
        }
    });

    test("a cover is drawn as a wearer seen for the first time", () => {
        const files = bundle({
            animations: {
                loop: { tracks: { body: { position: [[0, ["q.is_sneaking_time < 5 ? 0 : 16", 0]]] } } },
            },
        });
        const still = loadNameplate(engine, bundle({}));
        const cover = loadNameplate(engine, files);
        try {
            const body = leftmost(frameAt(still, 0, "Player", coverFrame(still)).under);
            expect(leftmost(frameAt(cover, 0, "Player", coverFrame(cover)).under)).toBe(body);
        } finally {
            still.free();
            cover.free();
        }
    });

    test("the name's colour counts an unchanged signal's time from when it was first shown", () => {
        const plate = loadNameplate(
            engine,
            shared({
                animations: { loop: { tracks: { "palette.ink": { keys: [[0, "q.is_sneaking_time < 5 ? 16711680 : 255"]] } } } },
            }),
        );
        try {
            const start = utcFrame(plate, NOW);
            for (const [frame, color] of [
                [0, 0xff0000],
                [29, 0xff0000],
                [31, 0x0000ff],
            ]) {
                const shot = frameAt(plate, 0, "Player", start + frame);
                expect(shot.looks[0].color).toBe(color);
                expect(bodyColor(shot)).toBe(color);
            }
        } finally {
            plate.free();
        }
    });

    test("a fresh preview shows the name after its appear animation", () => {
        const plate = loadNameplate(
            engine,
            shared({
                requires: ["nameplate", "nameplate_palette_animation", "nameplate_one_shots"],
                animations: {
                    loop: { tracks: { "palette.ink": { keys: [[0, "#FF0000"]] } } },
                    pop: { trigger: "appear", length: 12, tracks: { "palette.ink": { keys: [[0, "#FFFFFF"]] } } },
                },
            }),
        );
        try {
            const start = utcFrame(plate, NOW);
            for (const frame of [0, 1, 6]) {
                const shot = frameAt(plate, 0, "Player", start + frame);
                expect(shot.looks[0].color).toBe(0xff0000);
                expect(bodyColor(shot)).toBe(0xff0000);
            }
        } finally {
            plate.free();
        }
    });
});
describe("game textures", () => {
    const WASM = new URL("../../vendor/plusrenderer/plusrenderer.wasm", import.meta.url);
    const encoder = new TextEncoder();
    const sprite = (id: string, extra: Record<string, unknown> = {}) => ({
        resolution: "pixel",
        ...extra,
        nodes: [
            { id: "cell", type: "PixelCell" },
            { id: "uv", type: "mul", in: { a: "cell", b: [0.0625, 0.0625] } },
            { id: "tex", type: "AtlasSprite", in: { uv: "uv" }, set: { sprite: id } },
            { id: "out", type: "Output", in: { color: "tex" } },
        ],
    });
    const atlasPlate = () =>
        Object.fromEntries(
            Object.entries({
                "manifest.json": {
                    format: 1,
                    kind: "nameplate",
                    id: "atlas_plate",
                    requires: ["nameplate", "nameplate_materials"],
                    fps: 6,
                    loop: 12,
                    text: { mode: "vanilla", color: "ink", shadow: "none", outline: "none" },
                    layers: [
                        { id: "rim", depth: "behind" },
                        { id: "plate", depth: "background" },
                        { id: "sheen", depth: "over_background" },
                    ],
                },
                "palettes.json": { slots: [{ id: "ink", name: "Ink", ramp: ["#F4F1E8"] }] },
                "layers/rim.json": { kind: "material", material: "rim" },
                "layers/plate.json": { kind: "material", material: "planks" },
                "layers/sheen.json": { kind: "material", material: "sheen" },
                "materials/rim.json": sprite("minecraft:block/prismarine", { margins: [2, 2, 2, 2] }),
                "materials/planks.json": sprite("minecraft:block/oak_planks"),
                "materials/sheen.json": {
                    resolution: "smooth",
                    emissive: true,
                    nodes: [
                        { id: "uv", type: "TagUV" },
                        { id: "stretch", type: "mul", in: { a: "uv", b: [0.5, 0.125] } },
                        { id: "tex", type: "VanillaTexture", in: { uv: "stretch" }, set: { texture: "glint" } },
                        { id: "soft", type: "Alpha", in: { color: "tex", alpha: 0.35 } },
                        { id: "out", type: "Output", in: { color: "soft" }, set: { blend: "additive" } },
                    ],
                },
            }).map(([path, value]) => [path, encoder.encode(JSON.stringify(value))]),
        );
    const name = "Player";
    const width = name.length * 6 - 1;
    const glyphs = new Float32Array(name.length * OUT.GLYPH_FLOATS);
    for (let i = 0; i < name.length; i++) {
        glyphs[i * OUT.GLYPH_FLOATS] = i * 6;
        glyphs[i * OUT.GLYPH_FLOATS + 1] = 5;
    }
    const row = tagRow({ asset: 0, variant: 0, nameWidth: width, lines: [width], glyphCount: name.length });
    const shown = (layer: { passes: Uint8ClampedArray[] }) => {
        let count = 0;
        for (const pass of layer.passes) for (let i = 3; i < pass.length; i += 4) if (pass[i]) count++;
        return count;
    };
    const layerPixels = (asset: Nameplate["asset"], seed: bigint) =>
        Object.fromEntries(asset.rasterLayers(row, 6, { glyphs, seed }).layers.map((layer) => [layer.id, shown(layer)]));

    test("every material layer draws with the placeholder game textures", async () => {
        const engine = await NameplateEngine.create(readFileSync(WASM));
        const plate = loadNameplate(engine, atlasPlate());
        try {
            expect(plate.standIns).toEqual(
                expect.arrayContaining([
                    { kind: "atlas", name: "minecraft:block/prismarine" },
                    { kind: "atlas", name: "minecraft:block/oak_planks" },
                    { kind: "vanilla", name: "glint" },
                ]),
            );
            expect(plate.standIns).toHaveLength(3);
            expect(plate.texturesBlank).toBe(false);
            expect(plate.textureNote).toContain("placeholder");
            const pixels = layerPixels(plate.asset, plate.seed);
            for (const id of ["rim", "plate", "sheen"]) expect(pixels[id], id).toBeGreaterThan(0);
            const shot = frameAt(plate, 0, name, utcFrame(plate, 1_764_000_000));
            let under = 0;
            for (let i = 3; i < shot.under.data.length; i += 4) if (shot.under.data[i]) under++;
            expect(under).toBeGreaterThan(0);
        } finally {
            plate.free();
        }
    });

    test("a plate without game textures has no texture note", async () => {
        const engine = await NameplateEngine.create(readFileSync(WASM));
        const files = atlasPlate();
        const manifest = JSON.parse(new TextDecoder().decode(files["manifest.json"]));
        manifest.requires = ["nameplate"];
        manifest.layers = [{ id: "body" }];
        const plate = loadNameplate(engine, {
            "manifest.json": encoder.encode(JSON.stringify(manifest)),
            "palettes.json": files["palettes.json"],
            "layers/body.json": encoder.encode(JSON.stringify({ kind: "body", padding: [2, 1, 2, 1], fill: { color: "ink" } })),
        });
        try {
            expect(plate.standIns).toEqual([]);
            expect(plate.texturesBlank).toBe(false);
            expect(plate.textureNote).toBeNull();
        } finally {
            plate.free();
        }
    });
});
