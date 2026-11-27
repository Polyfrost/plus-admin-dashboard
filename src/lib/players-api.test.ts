import { describe, expect, test } from "vitest";
import {
    bonusName,
    cosmeticName,
    describeFailure,
    equippedRows,
    fetchPlayerCosmetics,
    formatRgb,
    isUuid,
    normalizeUuid,
    paletteSwatches,
    parsePlayerCosmetics,
    playerCosmeticsPath,
    PlayerRequestError,
    privacyLabel,
    resolvePlayer,
    type PlayerCatalog,
    type PlayerCatalogCosmetic,
} from "./players-api";

const cosmetic = (over: Partial<PlayerCatalogCosmetic> & { id: number }): PlayerCatalogCosmetic => ({
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
    created_at: "2026-01-01T00:00:00Z",
    variant_key: null,
    asset_id: null,
    slots: [],
    color_slots: [],
    ...over,
});

const catalog: PlayerCatalog = {
    cosmetics: [
        cosmetic({ id: 12, name: "Frost Cape", color_slots: [{ name: "base" }, { name: "trim" }] }),
        cosmetic({ id: 31, type: "effect", name: "Snowfall" }),
        cosmetic({ id: 40, type: "nameplate", name: "Pride", group_id: 2, variant_name: "Rainbow", variant_key: "rainbow" }),
        cosmetic({ id: 41, type: "nameplate", name: "Plates", group_id: 2 }),
    ],
    groups: [{ id: 2, name: "Plates", type: "nameplate", enabled: true }],
    bundles: [],
};

const full = {
    uuid: "f7c77d99-9f15-4a66-a87d-c4a51ef30d19",
    username: "Steve",
    equipped: { tail: 9, cape: 12, effect_a: 31, nameplate: 40, mystery: 3 },
    particle_color: 16711680,
    shared_emote_privacy: "friends",
    pet_preferences: { interactions: false, updated_at: "2026-11-25T12:00:00+00:00" },
    discoveries: [
        {
            set_id: 3,
            name: "Winter",
            cosmetic_ids: [12, 31],
            discovered_at: "2026-11-25T12:00:00+00:00",
            delivered_at: null,
        },
    ],
    colors: [{ cosmetic_id: 12, active: true, palette: { trim: 16711680 }, aura_default: false }],
    live: { bonuses: [{ id: 3, url: "https://cdn/x.zip", hash: "ab12" }, { id: 4, hash: "cd34" }], active_emote_id: 7 },
};

const respond = (status: number, body: string) => async () => new Response(body, { status });

describe("uuids", () => {
    test("accepts dashed and undashed forms", () => {
        expect(isUuid("f7c77d99-9f15-4a66-a87d-c4a51ef30d19")).toBe(true);
        expect(isUuid(" F7C77D999F154A66A87DC4A51EF30D19 ")).toBe(true);
        expect(isUuid("Steve")).toBe(false);
        expect(isUuid("f7c77d99-9f15-4a66-a87d")).toBe(false);
    });

    test("normalizes to lowercase dashed", () => {
        expect(normalizeUuid("F7C77D999F154A66A87DC4A51EF30D19")).toBe("f7c77d99-9f15-4a66-a87d-c4a51ef30d19");
    });

    test("encodes the path", () => {
        expect(playerCosmeticsPath(" a/b ")).toBe("/v1/admin/players/a%2Fb/cosmetics");
    });
});

describe("parsePlayerCosmetics", () => {
    test("reads a full response", () => {
        const parsed = parsePlayerCosmetics(full);
        expect(parsed.username).toBe("Steve");
        expect(parsed.equipped.effect_a).toBe(31);
        expect(parsed.particle_color).toBe(16711680);
        expect(parsed.pet_preferences).toEqual({ interactions: false, updated_at: "2026-11-25T12:00:00+00:00" });
        expect(parsed.discoveries[0].delivered_at).toBeNull();
        expect(parsed.colors[0].palette).toEqual({ trim: 16711680 });
        expect(parsed.live?.bonuses).toEqual([
            { id: 3, url: "https://cdn/x.zip", hash: "ab12" },
            { id: 4, hash: "cd34" },
        ]);
        expect(parsed.live?.active_emote_id).toBe(7);
    });

    test("fills defaults for a sparse response", () => {
        const parsed = parsePlayerCosmetics({ uuid: "x", live: null });
        expect(parsed).toEqual({
            uuid: "x",
            username: null,
            equipped: {},
            particle_color: null,
            shared_emote_privacy: "everyone",
            pet_preferences: { interactions: true, updated_at: null },
            discoveries: [],
            colors: [],
            live: null,
        });
    });

    test("drops malformed entries", () => {
        const parsed = parsePlayerCosmetics({
            uuid: "x",
            equipped: { cape: "12", hat: 4 },
            discoveries: [null, { name: "No id" }, { set_id: 1, cosmetic_ids: [1, "2"] }],
            colors: [{ cosmetic_id: 5, palette: { a: 1, b: "red" } }, "junk"],
            live: { bonuses: [{ hash: "x" }], active_emote_id: "1" },
        });
        expect(parsed.equipped).toEqual({ hat: 4 });
        expect(parsed.discoveries).toEqual([
            { set_id: 1, name: "Set #1", cosmetic_ids: [1], discovered_at: "", delivered_at: null },
        ]);
        expect(parsed.colors).toEqual([{ cosmetic_id: 5, active: false, palette: { a: 1 }, aura_default: false }]);
        expect(parsed.live).toEqual({ bonuses: [], active_emote_id: null });
    });

    test("rejects a body without a uuid", () => {
        expect(() => parsePlayerCosmetics({ username: "Steve" })).toThrow(/can't read/);
        expect(() => parsePlayerCosmetics(null)).toThrow();
    });
});

describe("describeFailure", () => {
    test("explains each status plainly", () => {
        expect(describeFailure("cosmetics", 400, "Invalid URL")).toBe("That isn't a valid UUID.");
        expect(describeFailure("cosmetics", 404, "No player with that UUID has signed in")).toBe("No player with that UUID has signed in to PolyPlus yet.");
        expect(describeFailure("lookup", 404, "", "Notch")).toBe('No player called "Notch" has signed in to PolyPlus yet.');
        expect(describeFailure("lookup", 404, "")).toBe("No player with that name has signed in to PolyPlus yet.");
        expect(describeFailure("lookup", 400, "Enter a username")).toBe("Enter a username or UUID.");
        expect(describeFailure("cosmetics", 403, "")).toBe("You need the Manage cosmetics permission to view players.");
        expect(describeFailure("cosmetics", 401, "")).toBe("Your session has expired. Sign in again.");
        expect(describeFailure("cosmetics", 500, "Database error: boom")).toBe(
            "The server ran into an error (500): Database error: boom",
        );
        expect(describeFailure("cosmetics", 502, "")).toBe("The server ran into an error (502). Try again in a bit.");
        expect(describeFailure("cosmetics", 418, " teapot ")).toBe("teapot");
        expect(describeFailure("cosmetics", 418, "")).toBe("Request failed (418).");
    });
});

describe("requests", () => {
    test("resolvePlayer skips the lookup for a uuid", async () => {
        const send = async () => {
            throw new Error("should not be called");
        };
        await expect(resolvePlayer(send, "F7C77D999F154A66A87DC4A51EF30D19")).resolves.toBe(
            "f7c77d99-9f15-4a66-a87d-c4a51ef30d19",
        );
    });

    test("resolvePlayer looks up a username", async () => {
        const paths: string[] = [];
        const send = async (path: string) => {
            paths.push(path);
            return new Response(JSON.stringify({ uuid: "F7C77D99-9F15-4A66-A87D-C4A51EF30D19", username: "Steve" }));
        };
        await expect(resolvePlayer(send, " Ste ve ")).resolves.toBe("f7c77d99-9f15-4a66-a87d-c4a51ef30d19");
        expect(paths).toEqual(["/v1/admin/players/lookup?name=Ste%20ve"]);
        await resolvePlayer(send, "a&b=c#d");
        expect(paths[1]).toBe("/v1/admin/players/lookup?name=a%26b%3Dc%23d");
    });

    test("resolvePlayer rejects a lookup without a UUID", async () => {
        await expect(resolvePlayer(respond(200, JSON.stringify({ id: "f7c77d999f154a66a87dc4a51ef30d19" })), "Steve")).rejects.toThrow(
            "The username lookup didn't return a UUID.",
        );
    });

    test("resolvePlayer reports a missing name", async () => {
        const error = await resolvePlayer(respond(404, "No player with that name has signed in"), "Nobody").catch(
            (caught: unknown) => caught,
        );
        expect(error).toBeInstanceOf(PlayerRequestError);
        expect((error as PlayerRequestError).status).toBe(404);
        expect((error as Error).message).toBe('No player called "Nobody" has signed in to PolyPlus yet.');
    });

    test("resolvePlayer refuses empty input", async () => {
        await expect(resolvePlayer(respond(200, ""), "  ")).rejects.toThrow("Enter a username or UUID.");
    });

    test("fetchPlayerCosmetics parses a 200 and maps errors", async () => {
        await expect(fetchPlayerCosmetics(respond(200, JSON.stringify(full)), full.uuid)).resolves.toMatchObject({
            username: "Steve",
        });
        await expect(fetchPlayerCosmetics(respond(400, "bad"), "nope")).rejects.toThrow("That isn't a valid UUID.");
        await expect(fetchPlayerCosmetics(respond(500, ""), full.uuid)).rejects.toMatchObject({ status: 500 });
    });
});

describe("display helpers", () => {
    test("orders equipped slots by enum order with unknown slots last", () => {
        const rows = equippedRows(parsePlayerCosmetics(full).equipped, catalog);
        expect(rows.map((row) => row.slot)).toEqual(["cape", "nameplate", "effect_a", "tail", "mystery"]);
        expect(rows.map((row) => row.label)).toEqual(["Cape", "Nameplate", "Effect A", "Tail", "Mystery"]);
        expect(rows[1]).toMatchObject({ name: "Plates · Rainbow", variantKey: "rainbow", cosmeticId: 40 });
        expect(rows[3]).toMatchObject({ name: "Cosmetic #9", variantKey: null, cosmetic: undefined });
    });

    test("names cosmetics from the catalog", () => {
        expect(cosmeticName(catalog, 12)).toBe("Frost Cape");
        expect(cosmeticName(catalog, 41)).toBe("Plates");
        expect(cosmeticName(catalog, 99)).toBe("Cosmetic #99");
        expect(cosmeticName(undefined, 12)).toBe("Cosmetic #12");
    });

    test("formats colours", () => {
        expect(formatRgb(16711680)).toBe("#ff0000");
        expect(formatRgb(0x00ff)).toBe("#0000ff");
        expect(formatRgb(0)).toBe("#000000");
    });

    test("merges saved palette with declared colour slots", () => {
        const swatches = paletteSwatches(
            { cosmetic_id: 12, active: true, palette: { trim: 1, extra: 2 }, aura_default: false },
            catalog.cosmetics[0],
        );
        expect(swatches).toEqual([
            { name: "base", color: null },
            { name: "extra", color: 2 },
            { name: "trim", color: 1 },
        ]);
        expect(
            paletteSwatches({ cosmetic_id: 1, active: false, palette: {}, aura_default: true }, undefined),
        ).toEqual([]);
    });

    test("labels privacy", () => {
        expect(privacyLabel("friends")).toBe("Only friends can send duo emote requests");
        expect(privacyLabel("strangers")).toBe("Unknown setting (strangers)");
    });

    test("names bonuses from sets, then discoveries", () => {
        const discoveries = parsePlayerCosmetics(full).discoveries;
        expect(bonusName(3, [{ id: 3, name: "Winter Set" }], discoveries)).toBe("Winter Set");
        expect(bonusName(3, undefined, discoveries)).toBe("Winter");
        expect(bonusName(9, [], discoveries)).toBe("Set #9");
    });
});
