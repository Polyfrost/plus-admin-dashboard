import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch, useSession, type Session } from "@/lib/session";

/**
 * Calls the backend as the signed-in player. Every admin surface goes through
 * here so a failure reads the same wherever it happens.
 */
export async function adminRequest(
    session: Session,
    method: string,
    path: string,
    body?: unknown,
): Promise<unknown> {
    const isForm = body instanceof FormData;
    const response = await apiFetch(session, path, {
        method,
        headers: isForm ? {} : { "Content-Type": "application/json" },
        body:
            body === undefined
                ? undefined
                : isForm
                  ? body
                  : JSON.stringify(body),
    });

    if (response.status === 204) return null;

    const text = await response.text();
    if (!response.ok) {
        // The backend's own message says far more than a status code.
        throw new Error(text.trim() || `Request failed (${response.status})`);
    }

    return text ? JSON.parse(text) : null;
}

/** Every store query shares this prefix, so one write refreshes them all. */
const STORE_KEY = "store";

export function useAdminQuery<T>(path: string, enabled = true) {
    const session = useSession();
    return useQuery<T>({
        queryKey: [STORE_KEY, session.env, path],
        queryFn: () => adminRequest(session, "GET", path) as Promise<T>,
        // The app disables queries by default so the expensive analytics ones
        // wait for a Load press. These are small and load on open.
        enabled,
    });
}

/** The backend's `NumberedPage`, answered by lists paged with `page` and `nb`. */
export interface Paged<T> {
    items: T[];
    total_items: number;
    total_pages: number;
}

/** A paged list plus the page it is on; feed `page`/`setPage` to `<Pager>`. */
export function usePagedQuery<T>(path: string, size = 50) {
    const [page, setPage] = useState(1);
    const separator = path.includes("?") ? "&" : "?";
    const query = useAdminQuery<Paged<T>>(`${path}${separator}page=${page}&nb=${size}`);
    return { ...query, page, setPage };
}

/**
 * Runs a write and refreshes every store query: a price change shows in the
 * catalogue, a discount in the product list, a grant in orders. Refreshes on
 * failure too: the backend saves before pushing to PayNow, so a failed request
 * may still have changed the store.
 */
interface AdminCall {
    method: string;
    path: string;
    body?: unknown;
}

export function useAdminMutation<TVariables>(
    build: (variables: TVariables) => AdminCall | Promise<AdminCall>,
) {
    const session = useSession();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: async (variables: TVariables) => {
            const { method, path, body } = await build(variables);
            return adminRequest(session, method, path, body);
        },
        onSettled: () =>
            queryClient.invalidateQueries({ queryKey: [STORE_KEY] }),
    });
}

export interface CatalogCosmetic {
    id: number;
    name: string | null;
    type: string;
    enabled: boolean;
    group_id: number | null;
    variant_name: string | null;
    model_variant: string | null;
    variant_order: number;
    /** Null for an upload that is not sold on its own. */
    store_product_id: string | null;
    base_price: number | null;
    collection: number | null;
    description: string | null;
    purchase_count: number;
    url: string | null;
    cover_url: string | null;
    /** Looping animated webp, for cosmetics that move. */
    preview_url: string | null;
    tag_ids: number[];
    created_at: string;
}

export interface CatalogGroup {
    id: number;
    name: string;
    type: string;
    enabled: boolean;
}

export interface CatalogBundle {
    id: number;
    name: string;
    description: string | null;
    enabled: boolean;
    collection: number | null;
    store_product_id: string | null;
    base_price: number | null;
    cover_url: string | null;
    cosmetic_ids: number[];
    created_at: string;
}

export interface Catalog {
    cosmetics: CatalogCosmetic[];
    groups: CatalogGroup[];
    bundles: CatalogBundle[];
}

/**
 * What a player buys once: a variant group, or a cosmetic outside any group.
 * Prices, products, grants and listings all act on the unit — any variant id
 * stands for its whole group.
 */
export interface CosmeticUnit {
    /** `g12` for a group, `c34` for a lone cosmetic. */
    key: string;
    name: string;
    type: string;
    enabled: boolean;
    group_id: number | null;
    variants: CatalogCosmetic[];
    /** The variant the backend is addressed through. */
    first: CatalogCosmetic;
    store_product_id: string | null;
    base_price: number | null;
    collection: number | null;
    description: string | null;
    cover_url: string | null;
    preview_url: string | null;
}

export function cosmeticUnits(catalog: Catalog | undefined): CosmeticUnit[] {
    if (!catalog) return [];
    const groups = new Map(catalog.groups.map((group) => [group.id, group]));
    const units = new Map<string, CosmeticUnit>();

    const sorted = [...catalog.cosmetics].sort(
        (a, b) => a.variant_order - b.variant_order || a.id - b.id,
    );
    for (const cosmetic of sorted) {
        const group =
            cosmetic.group_id === null ? undefined : groups.get(cosmetic.group_id);
        const key = group ? `g${group.id}` : `c${cosmetic.id}`;
        const unit = units.get(key);
        if (unit) {
            unit.variants.push(cosmetic);
            // Variants share one product; any priced sibling speaks for all.
            unit.store_product_id ??= cosmetic.store_product_id;
            unit.base_price ??= cosmetic.base_price;
            continue;
        }
        units.set(key, {
            key,
            name: group?.name ?? cosmetic.name ?? `Cosmetic ${cosmetic.id}`,
            type: cosmetic.type,
            enabled: group ? group.enabled : cosmetic.enabled,
            group_id: group?.id ?? null,
            variants: [cosmetic],
            first: cosmetic,
            store_product_id: cosmetic.store_product_id,
            base_price: cosmetic.base_price,
            collection: cosmetic.collection,
            description: cosmetic.description,
            cover_url: cosmetic.cover_url,
            preview_url: cosmetic.preview_url,
        });
    }

    return [...units.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function useCatalog() {
    return useAdminQuery<Catalog>("/v1/admin/catalog");
}

export interface Tag {
    id: number;
    name: string;
    display_name: string | null;
    description: string | null;
    tag_type: "custom" | "color" | "category";
    paynow_tag_id: string | null;
}

export function useTags() {
    return useAdminQuery<{ tags: Tag[] }>("/tags/list");
}

export interface Collection {
    id: number;
    name: string;
    description: string | null;
    asset_id: number | null;
}

/** An `<img>` src for an asset: the backend redirects to object storage, which images may follow. */
export function assetUrl(env: string, id: number | null | undefined): string | undefined {
    return id == null ? undefined : `${env}/asset/${id}`;
}

export function useCollections() {
    return useAdminQuery<{ collections: Collection[] }>("/collections/list");
}

/** Where a cosmetic can be equipped; mirrors the backend's `BodySlot`. */
export const BODY_SLOTS = [
    "cape",
    "backpack",
    "glasses",
    "wings",
    "left_hand",
    "right_hand",
    "hat",
    "aura",
    "boots",
    "shoulder",
    "pet",
] as const;
export type BodySlot = (typeof BODY_SLOTS)[number];

/** USD major units, the way cosmetic and bundle prices are stored. */
export function formatPrice(price: number | null | undefined): string {
    return price == null ? "—" : `$${price.toFixed(2)}`;
}

/** Minor units in the given currency, the way orders and discounts are stored. */
export function formatMinor(
    minor: number | null | undefined,
    currency: string | null | undefined,
): string {
    if (minor == null) return "—";
    const code = (currency || "USD").toUpperCase();
    try {
        const f = new Intl.NumberFormat(undefined, {
            style: "currency",
            currency: code,
        });
        return f.format(minor / 10 ** (f.resolvedOptions().maximumFractionDigits ?? 2));
    } catch {
        return `${(minor / 100).toFixed(2)} ${code}`;
    }
}
