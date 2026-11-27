import { describe, expect, test } from "vitest";
import { zipSync } from "fflate";
import {
    ApiError,
    bundleProblems,
    buildCreateForm,
    buildSetCoverForm,
    buildVariantUpdate,
    catalogNeedsMerge,
    coverMode,
    coverProblems,
    errorIssues,
    errorMessage,
    inspectFiles,
    inferEffectSlots,
    inspectSingle,
    inspectZip,
    fixedInBlockbench,
    issueText,
    manifestVariantKeys,
    mergePublicVariants,
    parseErrorBody,
    parseUploadOutcome,
    sharedAssetVariants,
    slotOptions,
    uploadVisibility,
    validateSlots,
    variantKeyProblems,
    needsManualCover,
} from "./cosmetics-api";
import type { Catalog, CatalogCosmetic } from "./store-api";

const MIB = 1024 * 1024;
const text = (value: string) => new TextEncoder().encode(value);
const json = (value: unknown) => text(JSON.stringify(value));

const cosmetic = (over: Partial<CatalogCosmetic>): CatalogCosmetic => ({
    id: 0,
    name: null,
    type: "cape",
    enabled: true,
    group_id: null,
    variant_name: null,
    model_variant: null,
    variant_order: 0,
    store_product_id: null,
    base_price: null,
    collection: null,
    description: null,
    purchase_count: 0,
    url: null,
    cover_url: null,
    preview_url: null,
    tag_ids: [],
    created_at: "",
    ...over,
});

describe("slot rules", () => {
    test("nameplates take exactly the nameplate slot", () => {
        expect(validateSlots("nameplate", ["nameplate"])).toBeNull();
        expect(validateSlots("nameplate", [])).not.toBeNull();
        expect(validateSlots("nameplate", ["nameplate", "hat"])).not.toBeNull();
        expect(validateSlots("hat", ["nameplate"])).not.toBeNull();
    });

    test("effect slots are for effects only", () => {
        expect(validateSlots("effect", ["effect_a"])).toBeNull();
        expect(validateSlots("effect", ["effect_a", "effect_b"])).toBeNull();
        expect(validateSlots("effect", ["effect_a", "aura"])).not.toBeNull();
        expect(validateSlots("effect", [])).not.toBeNull();
        expect(validateSlots("aura", ["effect_b"])).not.toBeNull();
    });

    test("tail is open to every non-effect type", () => {
        for (const type of ["backpack", "wings", "aura", "pet"]) {
            expect(validateSlots(type, ["tail"])).toBeNull();
        }
        expect(validateSlots("effect", ["tail"])).not.toBeNull();
    });

    test("only emotes may have no slots", () => {
        expect(validateSlots("emote", [])).toBeNull();
        expect(validateSlots("hat", [])).not.toBeNull();
        expect(validateSlots("hat", ["halo"])).not.toBeNull();
    });

    test("pickers only offer slots the type may use", () => {
        expect(slotOptions("nameplate")).toEqual(["nameplate"]);
        expect(slotOptions("effect")).toEqual(["effect_a", "effect_b"]);
        expect(slotOptions("emote")).toEqual([]);
        const hat = slotOptions("hat");
        expect(hat).toContain("tail");
        expect(hat).not.toContain("nameplate");
        expect(hat).not.toContain("effect_a");
        for (const slot of hat) expect(validateSlots("hat", [slot])).toBeNull();
    });

    test("effects and nameplates never get a rendered cover", () => {
        expect(coverMode("effect")).toBe("upload");
        expect(coverMode("nameplate")).toBe("upload");
        expect(coverMode("hat")).toBe("render");
        expect(coverMode("hat", true)).toBe("upload");
    });
});

describe("error parsing", () => {
    const issue = {
        code: "badge_hidden",
        level: "warning",
        path: "manifest.json#badge",
        values: { covered: 0.75 },
        names: { layer: "frame" },
    };

    test("an invalid bundle body becomes a message and issues", () => {
        const body = parseErrorBody(
            400,
            JSON.stringify({ message: "The bundle failed validation", issues: [issue, { nope: true }] }),
        );
        expect(body.message).toBe("The bundle failed validation");
        expect(body.issues).toEqual([issue]);
    });

    test("plain text stays as the message", () => {
        expect(parseErrorBody(400, "Invalid body slot\n")).toEqual({ message: "Invalid body slot", issues: [] });
        expect(parseErrorBody(500, "")).toEqual({ message: "Request failed (500)", issues: [] });
        expect(parseErrorBody(400, "{not json")).toEqual({ message: "{not json", issues: [] });
    });

    test("bad fields in an issue are dropped", () => {
        const body = parseErrorBody(
            400,
            JSON.stringify({ message: "x", issues: [{ code: "a", level: "fatal", values: { n: "1", m: 2 }, names: { k: 3 } }] }),
        );
        expect(body.issues).toEqual([{ code: "a", level: "error", path: "", values: { m: 2 }, names: {} }]);
    });

    test("ApiError carries issues and spots duplicate keys", () => {
        const error = new ApiError(400, { message: "bad", issues: [issue as never] });
        expect(errorIssues(error)).toHaveLength(1);
        expect(errorIssues(new Error("x"))).toEqual([]);
        const duplicate = new ApiError(409, {
            message: 'Another variant in this group already uses the variant key "gold"',
            issues: [],
        });
        expect(errorMessage(duplicate)).toContain("“gold”");
        expect(errorMessage(new Error("plain"))).toBe("plain");
    });

    test("issue text uses the plugin's wording and falls back to the code", () => {
        expect(issueText(issue as never)).toBe("Badge hidden (layer frame, covered 0.75)");
        expect(issueText({ code: "geometry_missing", path: "manifest.json#geometry", values: {}, names: {} })).toBe(
            "The bundle needs a model. Add at least one cube.",
        );
        expect(issueText({ code: "no_frames", level: "error", path: "", values: {}, names: {} })).toBe("No frames");
        expect(issueText({ code: "odd_thing", path: "", values: { count: 3 }, names: { layer: "frame" } })).toBe(
            "Odd thing (layer frame, count 3)",
        );
    });

    test("issues without a level take the code's usual level", () => {
        expect(parseErrorBody(400, JSON.stringify({ message: "x", issues: [{ code: "badge_hidden" }] })).issues[0].level).toBe(
            "warning",
        );
    });

    test("only engine issues point at the Blockbench plugin", () => {
        const local = { code: "manifest_required", level: "error" as const, path: "", values: {}, names: {} };
        expect(fixedInBlockbench([local])).toBe(false);
        expect(fixedInBlockbench([local, { ...local, code: "geometry_missing" }])).toBe(true);
    });

    test("upload responses yield warnings, analysis and the new id", () => {
        const outcome = parseUploadOutcome({
            id: 9,
            variants: [{ id: 41 }],
            warnings: [issue],
            analysis: { requires: ["springs"], quads: 4, bones: 2 },
        });
        expect(outcome.cosmeticId).toBe(41);
        expect(outcome.warnings).toHaveLength(1);
        expect(outcome.analysis).toMatchObject({ requires: ["springs"], quads: 4, bones: 2, spring_bones: 0 });
        expect(parseUploadOutcome({ cosmetic_id: 7 })).toEqual({ warnings: [], analysis: null, cosmeticId: 7 });
        expect(parseUploadOutcome(null).cosmeticId).toBeNull();
    });
});

describe("multipart bodies", () => {
    const file = { blob: new Blob(["x"]), name: "bundle.zip" };

    test("create sends the new parts", () => {
        const form = buildCreateForm(
            {
                type: "nameplate",
                name: " Gold ",
                slots: ["nameplate"],
                group: "Gold",
                variantName: "Shiny",
                variantOrder: 2,
                variantKey: " shiny ",
                enabled: false,
            },
            file,
            { blob: new Blob(["png"]), name: "cover.png" },
        );
        expect(form.get("type")).toBe("nameplate");
        expect(form.get("name")).toBe("Gold");
        expect(form.getAll("slots")).toEqual(["nameplate"]);
        expect(form.get("group")).toBe("Gold");
        expect(form.get("variant_order")).toBe("2");
        expect(form.get("variant_key")).toBe("shiny");
        expect(form.get("enabled")).toBe("false");
        expect(form.get("cover")).toBeInstanceOf(Blob);
        expect(form.get("asset_from")).toBeNull();
    });

    test("nameplates can reuse a sibling's file instead of sending one", () => {
        const form = buildCreateForm(
            { type: "nameplate", name: "Gold", slots: ["nameplate"], group: "Gold", assetFrom: 12, variantKey: "dark" },
            null,
        );
        expect(form.get("asset_from")).toBe("12");
        expect(form.get("file")).toBeNull();
        expect(() =>
            buildCreateForm({ type: "hat", name: "Hat", slots: ["hat"], assetFrom: 12 }, null),
        ).toThrow();
        expect(() =>
            buildCreateForm({ type: "nameplate", name: "Gold", slots: ["nameplate"], assetFrom: 12 }, file),
        ).toThrow();
    });

    test("effects need a name and emotes send no slots", () => {
        expect(() => buildCreateForm({ type: "effect", name: " ", slots: ["effect_a"] }, file)).toThrow();
        expect(buildCreateForm({ type: "effect", name: "", group: "Sparks", slots: ["effect_a"] }, file).get("group")).toBe(
            "Sparks",
        );
        expect(buildCreateForm({ type: "emote", name: "Wave", slots: [] }, file).getAll("slots")).toEqual([]);
        expect(() => buildCreateForm({ type: "hat", name: "Hat", slots: ["effect_a"] }, file)).toThrow();
    });

    test("set-cover sends clear_preview only when asked", () => {
        const cover = { blob: new Blob(["png"]), name: "cover.png" };
        expect(buildSetCoverForm(3, cover, true).get("clear_preview")).toBe("true");
        const plain = buildSetCoverForm(3, cover, false);
        expect(plain.get("clear_preview")).toBeNull();
        expect(plain.get("cosmetic_id")).toBe("3");
    });

    test("variant updates only send what changed", () => {
        const variant = cosmetic({ id: 5, variant_key: "gold", slots: ["hat"], variant_order: 1 });
        expect(buildVariantUpdate(variant, { variantKey: "gold", slots: ["hat"], variantOrder: 1 })).toEqual({ cosmetic_id: 5 });
        expect(buildVariantUpdate(variant, { variantKey: "", slots: ["hat", "tail"] })).toEqual({
            cosmetic_id: 5,
            variant_key: null,
            slots: ["hat", "tail"],
        });
        expect(buildVariantUpdate(cosmetic({ id: 6 }), { variantKey: "x", slots: [] })).toEqual({
            cosmetic_id: 6,
            variant_key: "x",
        });
    });
});

describe("bundle pre-checks", () => {
    test("reads a zip's entries and manifest", () => {
        const zip = zipSync({
            "manifest.json": json({ format: 1, variants: { gold: {}, dark: {} } }),
            "textures/a.png": new Uint8Array(10),
            "__MACOSX/._a.png": new Uint8Array(1),
        });
        const info = inspectZip(zip);
        expect(info.entries.map((entry) => entry.name).sort()).toEqual(["manifest.json", "textures/a.png"]);
        expect(manifestVariantKeys(info.manifest)).toEqual(["gold", "dark"]);
        expect(bundleProblems("nameplate", info)).toEqual([]);
        expect(manifestVariantKeys({ format: 1 })).toEqual(["default"]);
    });

    test("nameplates and effects must be zips with a root manifest", () => {
        const png = inspectSingle("cape.png", new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
        expect(png.zip).toBe(false);
        expect(bundleProblems("nameplate", png)).toHaveLength(1);
        expect(bundleProblems("cape", png)).toEqual([]);

        const nested = inspectFiles([{ name: "inner/manifest.json", bytes: json({ kind: "effect" }) }], 100);
        expect(bundleProblems("effect", nested).join(" ")).toContain("inner/manifest.json");

        const none = inspectFiles([{ name: "a.png", bytes: new Uint8Array(4) }], 100);
        expect(bundleProblems("effect", none)).toHaveLength(1);
        expect(bundleProblems("hat", none)).toEqual([]);
    });

    test("manifest format and kind are checked", () => {
        const plate = inspectFiles([{ name: "manifest.json", bytes: json({ format: 2 }) }], 100);
        expect(bundleProblems("nameplate", plate).join(" ")).toContain("format 1");

        const pet = inspectFiles([{ name: "manifest.json", bytes: json({ kind: "item" }) }], 100);
        expect(bundleProblems("pet", pet).join(" ")).toContain("“pet”");
        const kindless = inspectFiles([{ name: "manifest.json", bytes: json({}) }], 100);
        expect(bundleProblems("hat", kindless)).toEqual(["The manifest has no kind. A hat needs “item”."]);
        expect(bundleProblems("wings", pet)).toEqual([]);

        const broken = inspectFiles([{ name: "manifest.json", bytes: text("{") }], 100);
        expect(bundleProblems("effect", broken).join(" ")).toContain("valid JSON");
    });

    test("size limits follow the type", () => {
        const big = (bytes: number, entries = 1, size = 1) =>
            inspectFiles(
                Array.from({ length: entries }, (_, index) => ({ name: `f${index}`, bytes: new Uint8Array(size) })),
                bytes,
            );
        expect(bundleProblems("effect", big(4 * MIB + 1)).join(" ")).toContain("at most 4 MiB");
        expect(bundleProblems("cape", big(16 * MIB))).toEqual([]);
        expect(bundleProblems("cape", big(100, 17))).toHaveLength(1);
        expect(bundleProblems("hat", big(100, 64))).toEqual([]);
        expect(bundleProblems("hat", big(100, 65))).toHaveLength(1);

        const plate = inspectFiles(
            [
                { name: "manifest.json", bytes: json({ format: 1, kind: "item" }) },
                { name: "big.png", bytes: new Uint8Array(MIB + 1) },
            ],
            100,
        );
        expect(bundleProblems("nameplate", plate).join(" ")).toContain("big.png");
        expect(bundleProblems("hat", plate)).toEqual([]);
    });

    test("covers must be small PNGs", () => {
        expect(coverProblems({ size: 100, type: "image/png" }, { width: 512, height: 512 })).toEqual([]);
        expect(coverProblems({ size: 100, type: "image/jpeg", name: "a.jpg" })).toHaveLength(1);
        expect(coverProblems({ size: 2 * MIB + 1, type: "image/png" })).toHaveLength(1);
        expect(coverProblems({ size: 100, name: "A.PNG" }, { width: 4096, height: 10 })).toHaveLength(1);
    });
});

describe("catalog merge", () => {
    const catalog: Catalog = {
        groups: [],
        bundles: [],
        cosmetics: [cosmetic({ id: 1 }), cosmetic({ id: 2, enabled: false }), cosmetic({ id: 3, variant_key: "kept", slots: ["hat"] })],
    };

    test("fills variant keys and slots from the public list", () => {
        expect(catalogNeedsMerge(catalog)).toBe(true);
        const merged = mergePublicVariants(catalog, {
            cosmetics: [
                { id: 10, variants: [{ id: 1, variant_key: "gold", allowed_slots: ["nameplate"] }] },
                { id: 11, variants: [{ id: 3, variant_key: "other", allowed_slots: ["tail"] }] },
            ],
        });
        expect(merged.cosmetics[0]).toMatchObject({ variant_key: "gold", slots: ["nameplate"] });
        expect(merged.cosmetics[1].variant_key).toBeUndefined();
        expect(merged.cosmetics[2]).toMatchObject({ variant_key: "kept", slots: ["hat"] });
        expect(mergePublicVariants(catalog, "nope")).toBe(catalog);
    });

    test("groups variants that share an asset", () => {
        const a = cosmetic({ id: 1, asset_id: 7 });
        const b = cosmetic({ id: 2, asset_id: 7 });
        const c = cosmetic({ id: 3, asset_id: 8 });
        const d = cosmetic({ id: 4 });
        expect(sharedAssetVariants([a, b, c, d], a).map((v) => v.id)).toEqual([2]);
        expect(sharedAssetVariants([a, b, c, d], d)).toEqual([]);
    });
});

describe("variant keys", () => {
    test("nameplate keys must exist in the bundle and be free in the group", () => {
        expect(variantKeyProblems("nameplate", "gold", ["gold", "dark"], [])).toEqual([]);
        expect(variantKeyProblems("nameplate", "red", ["gold", "dark"], [])).toHaveLength(1);
        expect(variantKeyProblems("nameplate", "red", [], [])).toEqual([]);
        expect(variantKeyProblems("hat", "red", ["gold"], [])).toEqual([]);
        expect(variantKeyProblems("hat", " red ", [], ["red", null])).toHaveLength(1);
        expect(variantKeyProblems("hat", "", [], [""])).toEqual([]);
    });

    test("render-cover refusals that point at set-cover are spotted", () => {
        expect(
            needsManualCover(
                new ApiError(400, {
                    message: "Bundles with a manifest.json can't get an automatic cover yet. Upload one with /set-cover",
                    issues: [],
                }),
            ),
        ).toBe(true);
        expect(needsManualCover(new ApiError(400, { message: "The cosmetic has no source asset to render", issues: [] }))).toBe(
            false,
        );
        expect(needsManualCover(new Error("/set-cover"))).toBe(false);
    });
});

describe("upload visibility", () => {
    test("a new nameplate follows the publish toggle", () => {
        expect(uploadVisibility("nameplate", null, false)).toMatchObject({ enabled: false, publishGroup: false, toggle: "Publish now" });
        expect(uploadVisibility("nameplate", null, true)).toMatchObject({ enabled: true, publishGroup: false });
    });

    test("other new cosmetics use the server default and offer no choice", () => {
        expect(uploadVisibility("cape", null, true)).toEqual({
            enabled: undefined,
            publishGroup: false,
            toggle: null,
            summary: null,
            hint: null,
        });
    });

    test("joining a live group says the new variants go live and offers no choice", () => {
        const visibility = uploadVisibility("nameplate", { name: "Pride", enabled: true }, false);
        expect(visibility).toMatchObject({ enabled: undefined, publishGroup: false, toggle: null });
        expect(visibility.hint).toContain("is live");
    });

    test("joining a hidden group can make the whole group live afterwards", () => {
        const kept = uploadVisibility("nameplate", { name: "Pride", enabled: false }, false);
        expect(kept).toMatchObject({ enabled: undefined, publishGroup: false });
        expect(kept.hint).toContain("is hidden");
        const published = uploadVisibility("nameplate", { name: "Pride", enabled: false }, true);
        expect(published).toMatchObject({ enabled: undefined, publishGroup: true });
        expect(published.toggle).not.toBeNull();
        expect(uploadVisibility("wings", { name: "Angel", enabled: false }, true).publishGroup).toBe(true);
    });
});

describe("effect slot inference", () => {
    test("a bundle with only trails goes in effect_a", () => {
        const guess = inferEffectSlots({ trails: true, moments: false });
        expect(guess.slots).toEqual(["effect_a"]);
        expect(guess.needsChoice).toBe(false);
    });

    test("a bundle with only named moments goes in effect_b", () => {
        const guess = inferEffectSlots({ trails: false, moments: true });
        expect(guess.slots).toEqual(["effect_b"]);
        expect(guess.needsChoice).toBe(false);
    });

    test("a bundle with both leaves the choice to the operator", () => {
        const guess = inferEffectSlots({ trails: true, moments: true });
        expect(guess.slots).toEqual([]);
        expect(guess.needsChoice).toBe(true);
        expect(guess.hint).toMatch(/both trails and moments/);
    });

    test("a bundle with neither leaves the choice to the operator", () => {
        const guess = inferEffectSlots({ trails: false, moments: false });
        expect(guess.slots).toEqual([]);
        expect(guess.needsChoice).toBe(true);
        expect(guess.hint).toMatch(/no trails or moments/);
    });

    test("an unreadable bundle leaves the choice to the operator", () => {
        for (const content of [null, undefined]) {
            const guess = inferEffectSlots(content);
            expect(guess.slots).toEqual([]);
            expect(guess.needsChoice).toBe(true);
            expect(guess.hint).toMatch(/couldn't be read/);
        }
    });

    test("a guessed slot is always valid for an effect", () => {
        for (const content of [{ trails: true, moments: false }, { trails: false, moments: true }]) {
            expect(validateSlots("effect", inferEffectSlots(content).slots)).toBeNull();
        }
    });
});

describe("flash check wording", () => {
    test("an unfinished flash check says the bundle can't go up", () => {
        const text = issueText({ code: "flash_unchecked", level: "error", path: "layers/body.json", values: { checked: 40, scenarios: 200 }, names: {} });
        expect(text).toContain("40 of 200");
        expect(text).not.toMatch(/may still flash/);
        expect(text).toMatch(/can't be uploaded/);
    });
});
