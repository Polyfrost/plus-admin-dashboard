import { expect, test } from "vitest";
import { cosmeticUnits, type CatalogCosmetic } from "./store-api";

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
