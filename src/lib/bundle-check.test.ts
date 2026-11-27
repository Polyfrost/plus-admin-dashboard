import { readFileSync } from "node:fs";
import { zipSync } from "fflate";
import { beforeAll, describe, expect, test } from "vitest";
import { blocksUpload, checkBundle, setEngineSource } from "./bundle-check";
import { issueText } from "./cosmetics-api";

const json = (value: unknown) => JSON.stringify(value);
const png = (base64: string) => Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
const encoder = new TextEncoder();
const zipOf = (files: Record<string, string | Uint8Array>) =>
    zipSync(Object.fromEntries(Object.entries(files).map(([name, data]) => [name, typeof data === "string" ? encoder.encode(data) : data])));

const WINGS_PNG = "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAJUlEQVR42mMwcAj4jw8TAgzDwICEhgX/8eGRYMB/CsGoAcPCAAAEZ4TuLAJVPQAAAABJRU5ErkJggg==";
const WINGS_IDX = "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAJklEQVR42mNgZGT8jw8zMDDgx8PAACYmpv/48EgwgAgFowYMfwMA60kAMP6llCwAAAAASUVORK5CYII=";

const wings = (): Record<string, string | Uint8Array> => ({
    "manifest.json": json({
        format: 1,
        kind: "item",
        id: "sample_wings",
        requires: ["controllers", "reactions", "palettes", "custom_colors"],
        geometry: "wings",
        textures: [{ id: "wings", palette: true }],
        palettes: true,
        animations: ["wings"],
        animationControllers: ["wings"],
        controllers: ["controller.animation.wings.mood"],
        attach: { rig: "player", bone: "body" },
        reactions: [
            { signal: "is_in_rain", on: "while", play: "droop", blend: 0.25, palette: "storm" },
            { signal: "is_hurt", on: "start", play: "flinch" },
        ],
    }),
    "models/wings.geo.json": json({
        format_version: "1.12.0",
        "minecraft:geometry": [
            {
                description: { identifier: "geometry.sample_wings", texture_width: 16, texture_height: 16 },
                bones: [
                    { name: "wings", parent: "body", pivot: [0, 24, 2] },
                    { name: "wing", parent: "wings", pivot: [0, 22, 2], cubes: [{ origin: [0, 14, 2], size: [8, 8, 1], uv: [0, 0] }] },
                ],
            },
        ],
    }),
    "animations/wings.animation.json": json({
        format_version: "1.8.0",
        animations: {
            "animation.wings.idle": { loop: true, animation_length: 2, bones: { wing: { rotation: { "0.0": [0, -10, 0], "1.0": [0, 10, 0], "2.0": [0, -10, 0] } } } },
            "animation.wings.droop": { loop: true, animation_length: 1, bones: { wing: { rotation: [40, 0, 0] } } },
            "animation.wings.flinch": { animation_length: 0.5, bones: { wing: { rotation: { "0.0": [0, 0, 0], "0.25": [0, 30, 0], "0.5": [0, 0, 0] } } } },
        },
    }),
    "animation_controllers/wings.animation_controllers.json": json({
        format_version: "1.10.0",
        animation_controllers: {
            "controller.animation.wings.mood": { initial_state: "default", states: { default: { animations: ["idle"] } } },
        },
    }),
    "palettes.json": json({
        slots: [{ id: "feather", name: "Feather", ramp: ["#ff304050", "#ff6080a0"], customizable: true }],
        colorways: { storm: { feather: ["#ff202020", "#ff505050"] } },
    }),
    "textures/wings.png": png(WINGS_PNG),
    "textures/wings.idx.png": png(WINGS_IDX),
});

const plate = (): Record<string, string> => ({
    "manifest.json": json({
        format: 1,
        kind: "nameplate",
        id: "tiny_plate",
        requires: ["nameplate"],
        fps: 6,
        loop: 12,
        layers: [{ id: "body" }],
        variants: { ember: { palette: "ember" }, frost: { palette: "frost" } },
    }),
    "layers/body.json": json({ kind: "body", padding: [4, 2, 4, 2], radius: 2, fill: { color: "fill" } }),
    "palettes.json": json({
        slots: [{ id: "fill", name: "Fill", ramp: ["#262A3A"] }],
        colorways: { ember: { fill: ["#802020"] }, frost: { fill: ["#203080"] } },
    }),
});

beforeAll(() => {
    setEngineSource(readFileSync(new URL("../vendor/plusrenderer/plusrenderer.wasm", import.meta.url)));
});

describe("items", () => {
    test("a valid item passes with its analysis and colorways", async () => {
        const report = await checkBundle("wings", zipOf(wings()));
        expect(report.status).toBe("valid");
        expect(report.issues).toEqual([]);
        expect(report.kind).toBe("item");
        expect(report.colorways).toEqual(["storm"]);
        expect(report.analysis).toMatchObject({ quads: 6, bones: 2 });
        expect(blocksUpload(report)).toBe(false);
    });

    test("a file map gives the same result as a zip", async () => {
        const report = await checkBundle("wings", wings());
        expect(report.status).toBe("valid");
    });

    test("an item with no model is invalid and says why", async () => {
        const files = wings();
        delete files["models/wings.geo.json"];
        const report = await checkBundle("hat", zipOf(files));
        expect(report.status).toBe("invalid");
        expect(blocksUpload(report)).toBe(true);
        const issue = report.issues.find((i) => i.level === "error");
        expect(issue).toBeDefined();
        expect(issueText(issue!)).toBe("The bundle needs 'models/wings.geo.json', which is missing.");
    });

    test("a bundle of the wrong kind is rejected", async () => {
        const report = await checkBundle("pet", zipOf(wings()));
        expect(report.status).toBe("invalid");
        const issue = report.issues.find((i) => i.code === "kind_mismatch")!;
        expect(issueText(issue)).toBe("The bundle is an 'item' bundle, but this cosmetic is a pet. Pick the matching type, or upload the right bundle.");
    });

    test("macOS junk is ignored", async () => {
        const report = await checkBundle("wings", zipOf({ ...wings(), "__MACOSX/._manifest.json": "x", ".DS_Store": "x" }));
        expect(report.status).toBe("valid");
    });

    test("a nested manifest is rejected", async () => {
        const nested = Object.fromEntries(Object.entries(wings()).map(([name, data]) => [`wings/${name}`, data]));
        const report = await checkBundle("wings", zipOf(nested));
        expect(report.status).toBe("invalid");
        expect(issueText(report.issues[0])).toBe("The bundle has 'wings/manifest.json' inside a folder. Put manifest.json at the top of the zip.");
    });
});

describe("legacy files", () => {
    test("a plain cape picture is legacy", async () => {
        const report = await checkBundle("cape", new File([png(WINGS_PNG)], "cape.png"));
        expect(report.status).toBe("legacy");
        expect(blocksUpload(report)).toBe(false);
    });

    test("a model and texture zip without a manifest is legacy", async () => {
        const report = await checkBundle(
            "wings",
            zipOf({
                "wings.geo.json": json({ format_version: "1.12.0", "minecraft:geometry": [] }),
                "wings.png": png(WINGS_PNG),
            }),
        );
        expect(report.status).toBe("legacy");
        expect(blocksUpload(report)).toBe(false);
    });

    test("an effect must have a manifest", async () => {
        const report = await checkBundle("effect", new File([png(WINGS_PNG)], "spark.png"));
        expect(report.status).toBe("invalid");
        expect(issueText(report.issues[0])).toBe("The bundle needs a manifest.json at the top of the zip. Effects can't be plain files.");
    });
});

describe("nameplates", () => {
    test("a nameplate lists its variant keys", async () => {
        const report = await checkBundle("nameplate", zipOf(plate()));
        expect(report.issues.filter((i) => i.level === "error")).toEqual([]);
        expect(report.status).toBe("valid");
        expect(report.kind).toBe("nameplate");
        expect(report.variantKeys).toEqual(["ember", "frost"]);
        expect(report.analysis).toHaveProperty("max_out_words");
    });

    test("a nameplate with a missing layer file is invalid", async () => {
        const files = plate();
        delete files["layers/body.json"];
        const report = await checkBundle("nameplate", zipOf(files));
        expect(report.status).toBe("invalid");
        const missing = report.issues.find((i) => i.code === "missing_file")!;
        expect(issueText(missing)).toBe("The bundle needs 'layers/body.json', which is missing.");
    });

    test("a nameplate without a manifest is rejected before the engine runs", async () => {
        const report = await checkBundle("nameplate", zipOf({ "layers/body.json": "{}" }));
        expect(report.status).toBe("invalid");
        expect(report.issues[0].code).toBe("manifest_required");
    });
});

describe("issue text", () => {
    test("engine phrases read as sentences about the file", () => {
        expect(issueText({ code: "json_invalid", path: "models/a.geo.json", values: {}, names: {} })).toBe("'models/a.geo.json' is not valid JSON.");
        expect(issueText({ code: "quads_over_budget", path: "models/a.geo.json", values: { actual: 900, limit: 800 }, names: {} })).toBe(
            "'models/a.geo.json' has 900 cube faces, and the limit is 800. Use fewer or smaller cubes.",
        );
    });

    test("a manifest setting issue names the setting", () => {
        expect(issueText({ code: "manifest", path: "manifest.json#fps", values: {}, names: {} })).toBe("The 'fps' setting in manifest.json is missing or wrong.");
    });
});

describe("effect content", () => {
    const withEffects = (patch: (manifest: Record<string, unknown>) => void) => {
        const files = wings();
        const manifest = JSON.parse(files["manifest.json"] as string);
        patch(manifest);
        files["manifest.json"] = json(manifest);
        files["textures/ribbon.png"] = png(WINGS_PNG);
        return files;
    };

    test("an item with no effects reports neither trails nor moments", async () => {
        const report = await checkBundle("wings", zipOf(wings()));
        expect(report.effectContent).toEqual({ trails: false, moments: false });
    });

    test("a bundle with a trail reports trails", async () => {
        const files = withEffects((m) => {
            (m.requires as string[]).push("effects", "trails");
            m.trails = [{ locator: "back", texture: "ribbon", width: 0.25 }];
        });
        const report = await checkBundle("wings", zipOf(files));
        expect(report.effectContent).toEqual({ trails: true, moments: false });
    });

    test("a bundle with a named effect reports moments", async () => {
        const files = withEffects((m) => {
            (m.requires as string[]).push("effects", "particles", "events");
            m.effects = { death: { vanilla: "flame", locator: "head", count: 2 } };
        });
        const report = await checkBundle("wings", zipOf(files));
        expect(report.effectContent).toEqual({ trails: false, moments: true });
    });

    test("an unreadable bundle has no effect content", async () => {
        const report = await checkBundle("effect", new File([png(WINGS_PNG)], "spark.png"));
        expect(report.effectContent).toBeUndefined();
    });
});
