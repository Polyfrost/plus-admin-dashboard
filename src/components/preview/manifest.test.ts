import { describe, expect, test } from "vitest";
import { NO_COLORWAY, type RawCosmeticMeta } from "@/vendor/plusrenderer/cosmetic.js";
import {
    colorwayIndex,
    customPairs,
    hexColor,
    effectNames,
    isToggleSignal,
    manifestInfo,
    neutralSignal,
    paintOf,
    parseHexColor,
    petOptions,
    readSignals,
    slotBaseColors,
    withCustomColor,
} from "./manifest";

const reaction = (signal: string | null, colorway: string | null = null): RawCosmeticMeta["reactions"][number] => ({
    signal,
    signal_index: 0,
    on: "while",
    play: null,
    restart: false,
    blend: 0,
    speed: null,
    colorway,
    effect: null,
});

const meta = (over: Partial<RawCosmeticMeta> = {}) =>
    ({
        kind: "item",
        reactions: [],
        palette: {
            colorways: ["default", "storm"],
            slots: [
                { id: "trim", name: "Trim", customizable: true },
                { id: "base", name: "Base", customizable: false },
                { id: "glow", name: "Glow", customizable: true },
            ],
        },
        effects: {
            particles: [],
            sounds: [],
            emitters: 0,
            trails: [],
            named: ["sparkle"],
            moments: [
                { name: "flap", clip: 2, seconds: 1.5 },
                { name: "sparkle", clip: null, seconds: 0 },
            ],
            locators: [],
        },
        ...over,
    }) as RawCosmeticMeta;

const json = (value: unknown) => new TextEncoder().encode(JSON.stringify(value));

describe("readSignals", () => {
    test("takes the signals reactions listen to, in the host's order", () => {
        expect(readSignals(meta({ reactions: [reaction("is_hurt"), reaction("is_in_rain", "storm"), reaction(null)] }))).toEqual([
            "is_in_rain",
            "is_hurt",
        ]);
    });

    test("finds signals that controllers and animations read", () => {
        const files = {
            "animation_controllers/wings.animation_controllers.json": json({
                animation_controllers: {
                    "controller.animation.wings.mood": {
                        states: {
                            default: { transitions: [{ crouch: "q.is_sneaking && !query.owner.is_flying" }] },
                            crouch: { transitions: [{ default: "!q.is_sneaking" }] },
                        },
                    },
                },
            }),
            "animations/wings.animation.json": json({ blend: "query.ground_speed * 2 + q.anim_time" }),
            "textures/wings.png": new Uint8Array([0x71, 0x2e, 0x69, 0x73, 0x5f, 0x68, 0x75, 0x72, 0x74]),
        };
        expect(readSignals(meta(), files)).toEqual(["is_sneaking", "is_flying", "ground_speed"]);
    });

    test("ignores names the host doesn't send", () => {
        expect(readSignals(meta(), { "a.json": json({ x: "q.anim_time + q.life_time + q.not_a_signal" }) })).toEqual([]);
    });

    test("is_ signals are on/off, the rest are numbers", () => {
        expect(isToggleSignal("is_in_rain")).toBe(true);
        expect(isToggleSignal("ground_speed")).toBe(false);
    });

    test("unset signals start where the preview player starts them", () => {
        expect(neutralSignal("is_on_ground")).toBe(1);
        expect(neutralSignal("is_in_rain")).toBe(0);
    });
});

describe("manifestInfo", () => {
    test("lists colourways, custom slots, effects and moments once each", () => {
        const info = manifestInfo(meta({ reactions: [reaction("is_in_rain", "storm")] }));
        expect(info).toEqual({
            kind: "item",
            colorways: ["default", "storm"],
            customSlots: [
                { id: "trim", name: "Trim" },
                { id: "glow", name: "Glow" },
            ],
            effects: ["sparkle", "flap"],
            signals: ["is_in_rain"],
        });
    });

    test("effectNames copes with no effects", () => {
        expect(effectNames(undefined)).toEqual([]);
    });
});

describe("paint helpers", () => {
    test("colorwayIndex maps names and falls back to none", () => {
        expect(colorwayIndex(meta(), "storm")).toBe(1);
        expect(colorwayIndex(meta(), "missing")).toBe(NO_COLORWAY);
        expect(colorwayIndex(meta(), null)).toBe(NO_COLORWAY);
    });

    test("customPairs keeps only customizable slots", () => {
        expect(customPairs(meta(), { glow: 0x12345678, base: 0xff0000, nope: 1 })).toEqual([[2, 0x345678]]);
        expect(customPairs(meta(), undefined)).toEqual([]);
    });

    test("paintOf picks the colourway and customisable colours together", () => {
        expect(paintOf(meta(), "storm", { glow: 0xff00ff00, base: 0xff0000 })).toEqual({ colorway: 1, custom: [[2, 0x00ff00]] });
        expect(paintOf(meta(), "missing", { base: 0xff0000 })).toEqual({ colorway: NO_COLORWAY, custom: null });
        expect(paintOf(meta(), null)).toEqual({ colorway: NO_COLORWAY, custom: null });
    });

    test("petOptions hands the pet its files with the colourway and custom colours", () => {
        const files = { "animations/pet.json": new Uint8Array([1]) };
        expect(petOptions(meta(), files, "storm", { glow: 0x123456 })).toEqual({ files, colorway: 1, custom: [[2, 0x123456]] });
    });
});

describe("custom colour values", () => {
    test("hex round-trips through RGB and drops alpha", () => {
        expect(hexColor(0xff00ff00)).toBe("#00ff00");
        expect(hexColor(0x0a0b0c)).toBe("#0a0b0c");
        expect(parseHexColor("#0A0B0C")).toBe(0x0a0b0c);
        expect(parseHexColor("0a0b0c")).toBeNull();
        expect(parseHexColor("#abc")).toBeNull();
    });

    test("a picked colour reaches the paint for its customisable slot", () => {
        const picked = withCustomColor(withCustomColor({}, "glow", "#00ff00"), "trim", "#123456");
        expect(withCustomColor(picked, "glow", "bad")).toBe(picked);
        expect(paintOf(meta(), "storm", picked)).toEqual({ colorway: 1, custom: [[2, 0x00ff00], [0, 0x123456]] });
    });
});

describe("slotBaseColors", () => {
    const files = (palette: unknown) => ({ "palettes.json": new TextEncoder().encode(JSON.stringify(palette)) });
    const palette = {
        slots: [
            { id: "fur", name: "Fur", ramp: ["#101010", "#806040", "#C0A080", "#FFFFFF"], customizable: true },
            { id: "eyes", ramp: ["#FF00FF00"] },
            { id: "glow", ramp: ["#000000", "#FFFFFF"], interpolate: 5, customizable: true },
            { id: "broken", ramp: ["red"] },
        ],
        colorways: { night: { fur: ["#000010", "#202060", "#4040A0"] } },
    };

    test("reads each slot's base tone, the one custom colours replace", () => {
        expect(slotBaseColors(files(palette))).toEqual({ fur: 0x806040, eyes: 0x00ff00, glow: 0x7f7f7f });
    });

    test("follows the picked colourway's ramp", () => {
        expect(slotBaseColors(files(palette), "night")).toMatchObject({ fur: 0x202060, glow: 0x7f7f7f });
        expect(slotBaseColors(files(palette), "missing").fur).toBe(0x806040);
    });

    test("gives nothing without a readable palette", () => {
        expect(slotBaseColors({})).toEqual({});
        expect(slotBaseColors({ "palettes.json": new TextEncoder().encode("{") })).toEqual({});
        expect(slotBaseColors(files({ slots: "no" }))).toEqual({});
    });
});
