import { expect, test } from "vitest";
import {
    UNCHECKED_SALE_HINT,
    catalogCheckedSince,
    cosmeticUnits,
    findUploadGroup,
    groupAfterPublish,
    groupOfCosmetic,
    groupState,
    publishProblem,
    uploadSaleHint,
    type CatalogCosmetic,
} from "./store-api";

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

test("variants collapse into their group and share its product", () => {
    const units = cosmeticUnits({
        groups: [{ id: 7, name: "Pride Cape", type: "cape", enabled: false }],
        bundles: [],
        cosmetics: [
            cosmetic({ id: 3, group_id: 7, variant_order: 2 }),
            cosmetic({
                id: 2,
                group_id: 7,
                variant_order: 1,
                store_product_id: "p1",
                base_price: 4.99,
            }),
            cosmetic({ id: 5, name: "Halo" }),
        ],
    });

    expect(units.map((unit) => unit.key)).toEqual(["c5", "g7"]);
    const group = units[1];
    expect(group.name).toBe("Pride Cape");
    expect(group.enabled).toBe(false);
    expect(group.first.id).toBe(2);
    expect(group.variants.map((v) => v.id)).toEqual([2, 3]);
    expect(group.store_product_id).toBe("p1");
    expect(group.base_price).toBe(4.99);
    expect(units[0].store_product_id).toBeNull();
});

test("the upload hint follows the group the variants join", () => {
    expect(uploadSaleHint(null, false)).toMatch(/Nothing is put on sale/);
    expect(uploadSaleHint(null, true)).toMatch(/not on sale/);
    const priced = { store_product_id: "p1", base_price: 4.99 };
    expect(uploadSaleHint(priced, false)).toMatch(/part of the group's store product, priced at \$4\.99/);
    expect(uploadSaleHint(priced, true)).toMatch(/part of the group's store product, priced at \$4\.99/);
    expect(uploadSaleHint(priced, false)).not.toMatch(/Nothing is put on sale/);
    expect(uploadSaleHint({ store_product_id: "p1", base_price: null }, false)).toMatch(/^The new variants will be part of the group's store product\. /);
    expect(uploadSaleHint({ store_product_id: null, base_price: null }, false)).toMatch(/no store product of its own/);
    expect(uploadSaleHint(priced, false, false)).toMatch(/hidden, so nobody can buy/);
});

test("uploads find their group the way the backend does: trimmed name, exact case, same type", () => {
    const catalog = {
        groups: [
            { id: 7, name: "Pride", type: "cape", enabled: true },
            { id: 8, name: "Pride", type: "nameplate", enabled: false },
            { id: 9, name: "Empty", type: "cape", enabled: false },
        ],
        bundles: [],
        cosmetics: [
            cosmetic({ id: 2, group_id: 7, store_product_id: "p1", base_price: 4.99 }),
            cosmetic({ id: 4, type: "nameplate", group_id: 8 }),
            cosmetic({ id: 6, name: "Pride" }),
        ],
    };

    const cape = findUploadGroup(catalog, "cape", "  Pride ");
    expect(cape?.group.id).toBe(7);
    expect(cape?.unit?.first.id).toBe(2);
    expect(cape?.unit?.store_product_id).toBe("p1");
    expect(findUploadGroup(catalog, "nameplate", "Pride")?.group.id).toBe(8);
    expect(findUploadGroup(catalog, "cape", "pride")).toBeNull();
    expect(findUploadGroup(catalog, "hat", "Pride")).toBeNull();
    expect(findUploadGroup(catalog, "cape", "   ")).toBeNull();
    const empty = findUploadGroup(catalog, "cape", "Empty");
    expect(empty?.group.id).toBe(9);
    expect(empty?.unit).toBeNull();
});

test("a grouped upload waits for a catalogue read that succeeded after the check started", () => {
    const catalog = { groups: [], bundles: [], cosmetics: [] };
    expect(catalogCheckedSince({ data: undefined, isError: false, dataUpdatedAt: 0 }, 0)).toBe(false);
    expect(catalogCheckedSince({ data: catalog, isError: false, dataUpdatedAt: 100 }, 100)).toBe(true);
    expect(catalogCheckedSince({ data: catalog, isError: false, dataUpdatedAt: 99 }, 100)).toBe(false);
    expect(catalogCheckedSince({ data: catalog, isError: true, dataUpdatedAt: 200 }, 100)).toBe(false);
});

test("the group's state after publishing is read back from the catalogue", () => {
    const catalog = {
        groups: [
            { id: 7, name: "Pride", type: "cape", enabled: true },
            { id: 8, name: "Angel", type: "wings", enabled: false },
        ],
        bundles: [],
        cosmetics: [
            cosmetic({ id: 2, group_id: 7, variant_order: 1 }),
            cosmetic({ id: 3, group_id: 7, variant_order: 0, store_product_id: "p1", base_price: 2.5 }),
            cosmetic({ id: 4, type: "wings", group_id: 8 }),
            cosmetic({ id: 6, name: "Halo" }),
        ],
    };
    const live = { id: 3, name: "Pride", enabled: true, store_product_id: "p1", base_price: 2.5 };
    expect(groupOfCosmetic(catalog, 2)).toEqual(live);
    expect(groupOfCosmetic(catalog, 3)).toEqual(live);
    expect(groupOfCosmetic(catalog, 4)).toEqual({ id: 4, name: "Angel", enabled: false, store_product_id: null, base_price: null });
    expect(groupOfCosmetic(catalog, 6)).toBeNull();
    expect(groupOfCosmetic(catalog, 99)).toBeNull();
    expect(groupState(findUploadGroup(catalog, "cape", "Pride")!)).toEqual(live);
    const empty = { groups: [{ id: 9, name: "Empty", type: "cape", enabled: false }], bundles: [], cosmetics: [] };
    expect(groupState(findUploadGroup(empty, "cape", "Empty")!)).toEqual({
        id: null,
        name: "Empty",
        enabled: false,
        store_product_id: null,
        base_price: null,
    });
});

test("after a publish the wizard trusts a fresh read, then the request's own result", () => {
    const catalog = {
        groups: [{ id: 7, name: "Pride", type: "cape", enabled: true }],
        bundles: [],
        cosmetics: [cosmetic({ id: 3, group_id: 7, store_product_id: "p1", base_price: 2.5 })],
    };
    const before = { id: 3, name: "Pride", enabled: false, store_product_id: "p1", base_price: 1 };
    const live = { id: 3, name: "Pride", enabled: true, store_product_id: "p1", base_price: 2.5 };
    expect(groupAfterPublish({ data: catalog, isError: false }, 3, before, false)).toEqual(live);
    expect(groupAfterPublish({ data: catalog, isError: false }, 3, before, true)).toEqual(live);
    expect(groupAfterPublish({ data: catalog, isError: true }, 3, before, false)).toBeNull();
    expect(groupAfterPublish({ data: undefined, isError: false }, 3, before, false)).toBeNull();
    expect(groupAfterPublish({ data: catalog, isError: true }, 3, before, true)).toEqual({ ...before, enabled: true });
});

test("a failed publish says what is known about the group", () => {
    const group = { id: 3, name: "Pride", enabled: false, store_product_id: "p1", base_price: 2.5 };
    expect(publishProblem(group)).toMatch(/still hidden/);
    expect(publishProblem({ ...group, enabled: true })).toMatch(/live in game.*store update may not have gone through/);
    expect(publishProblem({ ...group, enabled: true, store_product_id: null })).not.toMatch(/hidden/);
    expect(publishProblem(null)).toMatch(/couldn't check whether the group went live.*store update may not have gone through/);
    expect(publishProblem(null)).not.toMatch(/still hidden/);
    expect(UNCHECKED_SALE_HINT).toMatch(/can't tell whether the group is live or on sale/);
});

test("a failed store update leaves the sale hint uncertain instead of claiming the variants are sold", () => {
    const priced = { store_product_id: "p1", base_price: 4.99 };
    const hint = uploadSaleHint(priced, true, true, true);
    expect(hint).toMatch(/can't tell yet whether the new variants are on sale/);
    expect(hint).toMatch(/Try the store update again/);
    expect(hint).not.toMatch(/store product/);
    expect(uploadSaleHint(priced, true, false, true)).toMatch(/hidden, so nobody can buy/);
    expect(uploadSaleHint({ store_product_id: null, base_price: null }, true, true, true)).toMatch(/no store product of its own/);
});
