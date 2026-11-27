import { describe, expect, test } from "vitest";
import {
    boundaryDelay,
    buildSetBody,
    checkEffectFile,
    comboForSet,
    comboIds,
    draftFromSet,
    effectOutcome,
    hiddenNote,
    emptyDraft,
    nextBoundary,
    previewBonuses,
    repeatWarning,
    requirementLabel,
    slotsFit,
    windowStatus,
    type CatalogWithKeys,
    type SetDraft,
    type SetInfo,
} from "./sets-api";

const draft = (over: Partial<SetDraft> = {}): SetDraft => ({
    ...emptyDraft(),
    name: "  Night Watch ",
    priority: "3",
    requirements: [{ kind: "cosmetic", cosmeticId: 1 }],
    ...over,
});

const error = (result: ReturnType<typeof buildSetBody>) => (result.ok ? null : result.error);

describe("buildSetBody", () => {
    test("a valid set is normalized", () => {
        const result = buildSetBody(
            draft({
                effectAssetId: 9,
                requirements: [
                    { kind: "cosmetic", cosmeticId: 1 },
                    { kind: "variant", groupId: 2, variantKey: " red " },
                    { kind: "group", groupId: 3 },
                ],
            }),
        );
        expect(result).toEqual({
            ok: true,
            body: {
                name: "Night Watch",
                priority: 3,
                effect_asset_id: 9,
                active_from: null,
                active_until: null,
                requirements: [{ cosmetic_id: 1 }, { group_id: 2, variant_key: "red" }, { group_id: 3 }],
            },
        });
    });

    test("names must be present and at most 64 characters", () => {
        expect(error(buildSetBody(draft({ name: "   " })))).toMatch(/name/);
        expect(error(buildSetBody(draft({ name: "x".repeat(65) })))).toMatch(/64/);
        expect(buildSetBody(draft({ name: "x".repeat(64) })).ok).toBe(true);
        expect(buildSetBody(draft({ name: "🌙".repeat(64) })).ok).toBe(true);
    });

    test("priority defaults to zero and must be a 32-bit whole number", () => {
        const blank = buildSetBody(draft({ priority: "" }));
        expect(blank.ok && blank.body.priority).toBe(0);
        expect(buildSetBody(draft({ priority: "-5" })).ok).toBe(true);
        expect(error(buildSetBody(draft({ priority: "1.5" })))).toMatch(/whole/);
        expect(error(buildSetBody(draft({ priority: "abc" })))).toMatch(/whole/);
        expect(error(buildSetBody(draft({ priority: "2147483648" })))).toMatch(/whole/);
    });

    test("requirement counts are bounded", () => {
        expect(error(buildSetBody(draft({ requirements: [] })))).toMatch(/at least one/);
        const many = (n: number) => Array.from({ length: n }, (_, i) => ({ kind: "cosmetic" as const, cosmeticId: i }));
        expect(error(buildSetBody(draft({ requirements: many(9) })))).toMatch(/8/);
        expect(buildSetBody(draft({ requirements: many(8) })).ok).toBe(true);
    });

    test("each requirement names its target", () => {
        expect(error(buildSetBody(draft({ requirements: [{ kind: "cosmetic", cosmeticId: null }] })))).toMatch(
            /Requirement 1 needs a cosmetic/,
        );
        expect(
            error(
                buildSetBody(
                    draft({
                        requirements: [
                            { kind: "cosmetic", cosmeticId: 1 },
                            { kind: "group", groupId: null },
                        ],
                    }),
                ),
            ),
        ).toMatch(/Requirement 2 needs a group/);
    });

    test("variant keys need a group and 1 to 64 characters", () => {
        expect(error(buildSetBody(draft({ requirements: [{ kind: "variant", groupId: 2, variantKey: "  " }] })))).toMatch(
            /variant key/,
        );
        expect(
            error(buildSetBody(draft({ requirements: [{ kind: "variant", groupId: 2, variantKey: "k".repeat(65) }] }))),
        ).toMatch(/64/);
        expect(
            error(buildSetBody(draft({ requirements: [{ kind: "variant", groupId: null, variantKey: "red" }] }))),
        ).toMatch(/needs a group/);
    });

    test("the same group may be required twice", () => {
        expect(
            buildSetBody(
                draft({
                    requirements: [
                        { kind: "group", groupId: 2 },
                        { kind: "group", groupId: 2 },
                    ],
                }),
            ).ok,
        ).toBe(true);
    });

    test("windows must end after they start", () => {
        const start = "2026-12-01T00:00:00.000Z";
        expect(error(buildSetBody(draft({ activeFrom: start, activeUntil: start })))).toMatch(/end after/);
        expect(
            error(buildSetBody(draft({ activeFrom: "2026-12-08T00:00:00.000Z", activeUntil: start }))),
        ).toMatch(/end after/);
        expect(buildSetBody(draft({ activeFrom: start, activeUntil: "2026-12-08T00:00:00.000Z" })).ok).toBe(true);
        expect(buildSetBody(draft({ activeFrom: start })).ok).toBe(true);
        expect(error(buildSetBody(draft({ activeUntil: "not a date" })))).toMatch(/end date/);
    });

    test("an edited set keeps its effect and round-trips its requirements", () => {
        const set: SetInfo = {
            id: 4,
            name: "Duo",
            priority: 1,
            effect_asset_id: 12,
            effect_url: null,
            active_from: null,
            active_until: "2027-01-01T00:00:00+00:00",
            created_at: "2026-11-01T00:00:00+00:00",
            requirements: [{ cosmetic_id: 1 }, { group_id: 2 }, { group_id: 3, variant_key: "red" }],
        };
        const result = buildSetBody(draftFromSet(set));
        expect(result.ok && result.body).toEqual({
            name: "Duo",
            priority: 1,
            effect_asset_id: 12,
            active_from: null,
            active_until: "2027-01-01T00:00:00+00:00",
            requirements: set.requirements,
        });
    });
});

test("window status follows the server's active rule", () => {
    const now = Date.parse("2026-12-05T00:00:00Z");
    const from = "2026-12-01T00:00:00Z";
    const until = "2026-12-10T00:00:00Z";
    expect(windowStatus({ active_from: null, active_until: null }, now)).toBe("always");
    expect(windowStatus({ active_from: from, active_until: until }, now)).toBe("live");
    expect(windowStatus({ active_from: until, active_until: null }, now)).toBe("scheduled");
    expect(windowStatus({ active_from: null, active_until: from }, now)).toBe("ended");
    expect(windowStatus({ active_from: null, active_until: "2026-12-05T00:00:00Z" }, now)).toBe("ended");
    expect(windowStatus({ active_from: "2026-12-05T00:00:00Z", active_until: null }, now)).toBe("live");
});

test("the next window boundary is the soonest future start or end", () => {
    const now = Date.parse("2026-12-05T00:00:00Z");
    expect(nextBoundary([], now)).toBeNull();
    expect(nextBoundary([{ active_from: null, active_until: null }], now)).toBeNull();
    expect(
        nextBoundary([{ active_from: "2026-12-01T00:00:00Z", active_until: "2026-12-04T00:00:00Z" }], now),
    ).toBeNull();
    expect(nextBoundary([{ active_from: "2026-12-05T00:00:00Z", active_until: null }], now)).toBeNull();
    expect(
        nextBoundary(
            [
                { active_from: "2026-12-01T00:00:00Z", active_until: "2026-12-10T00:00:00Z" },
                { active_from: "2026-12-08T00:00:00Z", active_until: "2026-12-20T00:00:00Z" },
                { active_from: null, active_until: null },
            ],
            now,
        ),
    ).toBe(Date.parse("2026-12-08T00:00:00Z"));
    const next = nextBoundary([{ active_from: "2026-12-07T00:00:00Z", active_until: null }], now);
    expect(next).toBe(Date.parse("2026-12-07T00:00:00Z"));
    expect(windowStatus({ active_from: "2026-12-07T00:00:00Z", active_until: null }, next! - 1)).toBe("scheduled");
    expect(windowStatus({ active_from: "2026-12-07T00:00:00Z", active_until: null }, next!)).toBe("live");
});

test("timer delays are measured from the current clock, not the page-load clock", () => {
    const later = Date.parse("2026-12-05T15:00:00Z");
    const created = { active_from: "2026-12-05T14:00:00Z", active_until: "2026-12-05T20:00:00Z" };
    expect(windowStatus(created, later)).toBe("live");
    expect(boundaryDelay([created], later)).toBe(5 * 60 * 60 * 1000);
    expect(boundaryDelay([{ active_from: "2026-12-05T08:00:00Z", active_until: null }], later)).toBeNull();
    expect(boundaryDelay([{ active_from: "2027-12-05T00:00:00Z", active_until: null }], later)).toBe(2_147_483_647);
});

test("effect files must be zips of at most 4 MiB", () => {
    expect(checkEffectFile({ name: "glow.zip", size: 1024 })).toBeNull();
    expect(checkEffectFile({ name: "GLOW.ZIP", size: 4 * 1024 * 1024 })).toBeNull();
    expect(checkEffectFile({ name: "glow.png", size: 10 })).toMatch(/zip/);
    expect(checkEffectFile({ name: "glow.zip", size: 4 * 1024 * 1024 + 1 })).toMatch(/4 MiB/);
});

describe("previewBonuses", () => {
    const calls: { path: string; init: RequestInit }[] = [];
    const reply =
        (response: Response) =>
        async (path: string, init: RequestInit) => {
            calls.push({ path, init });
            return response;
        };

    test("sends deduplicated ids and returns the bonuses", async () => {
        calls.length = 0;
        const result = await previewBonuses(
            reply(new Response(JSON.stringify({ bonuses: [{ id: 3, url: "https://x/a.zip", hash: "ab" }] }))),
            [5, 6, 5],
        );
        expect(result).toEqual([{ id: 3, url: "https://x/a.zip", hash: "ab" }]);
        expect(calls[0].path).toBe("/cosmetics/manage/sets/preview");
        expect(calls[0].init.method).toBe("POST");
        expect(JSON.parse(calls[0].init.body as string)).toEqual({ cosmetic_ids: [5, 6] });
    });

    test("other errors throw the server's message", async () => {
        await expect(
            previewBonuses(reply(new Response("These cosmetics can't be worn together", { status: 400 })), [1, 2]),
        ).rejects.toThrow("These cosmetics can't be worn together");
        await expect(previewBonuses(reply(new Response("", { status: 503 })), [1])).rejects.toThrow(/unavailable/);
    });

    test("more than 32 cosmetics never reach the server", async () => {
        calls.length = 0;
        const ids = Array.from({ length: 33 }, (_, i) => i);
        await expect(previewBonuses(reply(new Response("{}")), ids)).rejects.toThrow(/32/);
        expect(calls).toHaveLength(0);
        expect(comboIds([...ids.slice(0, 32), 0])).toHaveLength(32);
    });
});

const catalog: CatalogWithKeys = {
    groups: [{ id: 7, name: "Lantern", type: "hat", enabled: true }],
    bundles: [],
    cosmetics: [
        { id: 1, name: "Cloak", type: "cape", enabled: true, group_id: null, variant_name: null, model_variant: null, variant_order: 0, store_product_id: null, base_price: null, collection: null, description: null, purchase_count: 0, url: null, cover_url: null, preview_url: null, tag_ids: [], created_at: "" },
        { id: 11, name: null, type: "hat", enabled: true, group_id: 7, variant_name: "Blue", variant_key: "blue", model_variant: null, variant_order: 2, store_product_id: null, base_price: null, collection: null, description: null, purchase_count: 0, url: null, cover_url: null, preview_url: null, tag_ids: [], created_at: "" },
        { id: 10, name: null, type: "hat", enabled: true, group_id: 7, variant_name: "Red", variant_key: "red", model_variant: null, variant_order: 1, store_product_id: null, base_price: null, collection: null, description: null, purchase_count: 0, url: null, cover_url: null, preview_url: null, tag_ids: [], created_at: "" },
    ],
};

test("requirements read as names from the catalog", () => {
    expect(requirementLabel(catalog, { cosmetic_id: 1 })).toBe("Cloak");
    expect(requirementLabel(catalog, { cosmetic_id: 11 })).toBe("Lantern · Blue");
    expect(requirementLabel(catalog, { group_id: 7 })).toBe("Lantern (any variant)");
    expect(requirementLabel(catalog, { group_id: 7, variant_key: "red" })).toBe("Lantern · red");
    expect(requirementLabel(catalog, { group_id: 99 })).toBe("Group #99 (any variant)");
    expect(requirementLabel(undefined, { cosmetic_id: 4 })).toBe("Cosmetic #4");
});

test("hidden notes count the variant's group", () => {
    const lantern = catalog.cosmetics.find((cosmetic) => cosmetic.id === 10)!;
    const cloak = catalog.cosmetics.find((cosmetic) => cosmetic.id === 1)!;
    const shut: CatalogWithKeys = { ...catalog, groups: [{ ...catalog.groups[0], enabled: false }] };
    expect(hiddenNote(catalog, lantern)).toBeNull();
    expect(hiddenNote(shut, lantern)).toBe("group hidden");
    expect(hiddenNote(shut, { ...lantern, enabled: false })).toBe("hidden");
    expect(hiddenNote(catalog, { ...cloak, enabled: false })).toBe("hidden");
    expect(hiddenNote(shut, cloak)).toBeNull();
});

test("a set's combo picks one cosmetic per requirement", () => {
    const set = (requirements: SetInfo["requirements"]): SetInfo => ({
        id: 1,
        name: "",
        priority: 0,
        effect_asset_id: null,
        effect_url: null,
        active_from: null,
        active_until: null,
        created_at: "",
        requirements,
    });
    expect(comboForSet(set([{ cosmetic_id: 1 }, { group_id: 7 }]), catalog)).toEqual({ ok: true, ids: [1, 10] });
    expect(comboForSet(set([{ group_id: 7, variant_key: "blue" }]), catalog)).toEqual({ ok: true, ids: [11] });
    expect(comboForSet(set([{ group_id: 7 }, { group_id: 7 }]), catalog)).toEqual({ ok: true, ids: [10, 11] });
    expect(comboForSet(set([{ group_id: 7, variant_key: "green" }]), catalog)).toEqual({
        ok: false,
        error: "Nothing in the catalog matches Lantern · green.",
    });
});

describe("filling a test combo from a set", () => {
    const set = (requirements: SetInfo["requirements"]): SetInfo => ({
        id: 1,
        name: "",
        priority: 0,
        effect_asset_id: null,
        effect_url: null,
        active_from: null,
        active_until: null,
        created_at: "",
        requirements,
    });
    const item = (id: number, group: number, order: number, slots: string[], key: string | null = null) => ({
        ...catalog.cosmetics[0],
        id,
        name: null,
        type: "hat",
        group_id: group,
        variant_name: key,
        variant_key: key,
        variant_order: order,
        slots,
    });
    const hands: CatalogWithKeys = {
        groups: [
            { id: 1, name: "Torch", type: "hat", enabled: true },
            { id: 2, name: "Shield", type: "hat", enabled: true },
        ],
        bundles: [],
        cosmetics: [
            item(10, 1, 0, ["left_hand"], "left"),
            item(11, 1, 1, ["right_hand"], "right"),
            item(20, 2, 0, ["left_hand"], "left"),
            item(30, 3, 0, ["left_hand", "right_hand"]),
            { ...catalog.cosmetics[0], id: 40, slots: ["left_hand"] },
            { ...catalog.cosmetics[0], id: 41, slots: ["left_hand"] },
        ],
    };

    test("picks variants that each get their own slot", () => {
        expect(comboForSet(set([{ group_id: 1 }, { group_id: 2 }]), hands)).toEqual({ ok: true, ids: [11, 20] });
        expect(comboForSet(set([{ group_id: 1 }, { group_id: 3 }, { group_id: 2 }]), hands)).toEqual({
            ok: false,
            error: "These cosmetics can't all be worn at once: there's no mix of variants that puts each one in its own slot.",
        });
    });

    test("fills specific requirements before broad ones", () => {
        expect(comboForSet(set([{ group_id: 1 }, { cosmetic_id: 40 }]), hands)).toEqual({ ok: true, ids: [11, 40] });
        expect(comboForSet(set([{ group_id: 1 }, { group_id: 1, variant_key: "left" }]), hands)).toEqual({
            ok: true,
            ids: [11, 10],
        });
        expect(comboForSet(set([{ group_id: 3 }, { cosmetic_id: 40 }]), hands)).toEqual({ ok: true, ids: [30, 40] });
    });

    test("says so when the set can't be worn", () => {
        expect(comboForSet(set([{ cosmetic_id: 40 }, { cosmetic_id: 41 }]), hands)).toEqual({
            ok: false,
            error: "These cosmetics can't all be worn at once: there's no mix of variants that puts each one in its own slot.",
        });
    });

    test("a set that repeats a cosmetic can't be completed", () => {
        expect(comboForSet(set([{ cosmetic_id: 40 }, { group_id: 1 }, { cosmetic_id: 40 }]), hands)).toEqual({
            ok: false,
            error: "This set lists Cloak more than once. Each requirement has to be met by a different cosmetic, so nobody can complete it.",
        });
        expect(comboForSet(set([{ cosmetic_id: 10 }, { group_id: 1, variant_key: "left" }]), hands)).toEqual({
            ok: false,
            error: "Some of these requirements can only be met by the same cosmetic. Each one needs its own, so nobody can complete this set.",
        });
        expect(comboForSet(set([{ cosmetic_id: 10 }, { group_id: 1 }]), hands)).toEqual({ ok: true, ids: [10, 11] });
    });

    test("the set editor warns about a repeated cosmetic", () => {
        expect(repeatWarning(catalog, [{ cosmetic_id: 1 }, { group_id: 7 }, { cosmetic_id: 1 }])).toBe(
            "This set lists Cloak more than once. Each requirement has to be met by a different cosmetic, so nobody can complete it.",
        );
        expect(repeatWarning(catalog, [{ cosmetic_id: 1 }, { group_id: 7 }, { group_id: 7 }])).toBeNull();
    });

    const wide = (groups: number, variants: number, slotsFor: (group: number, variant: number) => string[]) => {
        const built: CatalogWithKeys = { groups: [], bundles: [], cosmetics: [] };
        for (let group = 0; group < groups; group++) {
            built.groups.push({ id: 100 + group, name: `Group ${group}`, type: "hat", enabled: true });
            for (let variant = 0; variant < variants; variant++) {
                built.cosmetics.push(item(100 + group * 10 + variant, 100 + group, variant, slotsFor(group, variant)));
            }
        }
        return built;
    };
    const everyGroup = (groups: number) => set(Array.from({ length: groups }, (_, group) => ({ group_id: 100 + group })));

    test("finds the one working mix of 8 groups with 4 variants each", () => {
        const tricky = wide(8, 4, (group, variant) => {
            if (group === 0) return variant < 3 ? ["effect_a"] : ["hat"];
            if (group === 7) return ["effect_a"];
            return [["cape", "backpack", "glasses", "wings", "boots", "tail"][group - 1]];
        });
        expect(comboForSet(everyGroup(8), tricky)).toEqual({ ok: true, ids: [103, 110, 120, 130, 140, 150, 160, 170] });
    });

    test("rules out 8 groups that share two slots without searching every mix", () => {
        const crowded = wide(8, 4, () => ["left_hand", "right_hand"]);
        expect(comboForSet(everyGroup(8), crowded, 50)).toEqual({
            ok: false,
            error: "These cosmetics can't all be worn at once: there's no mix of variants that puts each one in its own slot.",
        });
    });

    test("says it gave up instead of calling the set impossible", () => {
        const result = comboForSet(set([{ group_id: 1 }, { group_id: 2 }]), hands, 1);
        expect(result).toEqual({
            ok: false,
            error: "There are too many variant mixes to check, so Fill gave up. The set may still work: pick the cosmetics by hand.",
        });
    });

    test("slots match like the server's loadout check", () => {
        expect(slotsFit([["left_hand", "right_hand"], ["left_hand"]])).toBe(true);
        expect(slotsFit([["left_hand"], ["left_hand"]])).toBe(false);
        expect(slotsFit([[]])).toBe(false);
        expect(slotsFit([null, ["cape"]])).toBe(true);
    });
});

describe("effectOutcome", () => {
    test("reads warnings and analysis next to the set", () => {
        const outcome = effectOutcome({
            id: 3,
            name: "Winter",
            warnings: [{ code: "unused_texture", level: "warning", path: "textures/x.png", values: {}, names: {} }],
            analysis: {
                requires: ["effects"],
                quads: 4,
                bones: 0,
                spring_bones: 0,
                live_particles: 12.5,
                trail_points: 8,
                record_bytes: 2048,
                texture_bytes: 4096,
            },
        });
        expect(outcome.warnings).toHaveLength(1);
        expect(outcome.warnings[0]).toMatchObject({ code: "unused_texture", level: "warning", path: "textures/x.png" });
        expect(outcome.analysis).toMatchObject({ requires: ["effects"], live_particles: 12.5, trail_points: 8 });
    });

    test("a plain SetInfo has nothing to show", () => {
        expect(effectOutcome({ id: 3, name: "Winter", effect_asset_id: 9 })).toEqual({ warnings: [], analysis: null });
        expect(effectOutcome(null)).toEqual({ warnings: [], analysis: null });
    });
});
