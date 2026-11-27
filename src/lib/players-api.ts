import { useQuery } from "@tanstack/react-query";
import { apiFetch, useSession } from "@/lib/session";
import type { Catalog, CatalogCosmetic } from "@/lib/store-api";
import type { BonusRef, Send } from "@/lib/sets-api";

export const PLAYER_SLOTS = [
    { slot: "cape", label: "Cape" },
    { slot: "backpack", label: "Backpack" },
    { slot: "glasses", label: "Glasses" },
    { slot: "wings", label: "Wings" },
    { slot: "left_hand", label: "Left hand" },
    { slot: "right_hand", label: "Right hand" },
    { slot: "hat", label: "Hat" },
    { slot: "aura", label: "Aura" },
    { slot: "boots", label: "Boots" },
    { slot: "shoulder", label: "Shoulder" },
    { slot: "pet", label: "Pet" },
    { slot: "nameplate", label: "Nameplate" },
    { slot: "effect_a", label: "Effect A" },
    { slot: "effect_b", label: "Effect B" },
    { slot: "tail", label: "Tail" },
] as const;

export type PlayerSlot = (typeof PLAYER_SLOTS)[number]["slot"];

export type EmotePrivacy = "everyone" | "friends" | "nobody";

export const PRIVACY_LABELS: Record<EmotePrivacy, string> = {
    everyone: "Anyone can send duo emote requests",
    friends: "Only friends can send duo emote requests",
    nobody: "Nobody can send duo emote requests",
};

export interface Discovery {
    set_id: number;
    name: string;
    cosmetic_ids: number[];
    discovered_at: string;
    delivered_at: string | null;
}

export interface CustomColors {
    cosmetic_id: number;
    active: boolean;
    palette: Record<string, number>;
    aura_default: boolean;
}

export interface LiveState {
    bonuses: BonusRef[];
    active_emote_id: number | null;
}

export interface PlayerCosmetics {
    uuid: string;
    username: string | null;
    equipped: Record<string, number>;
    particle_color: number | null;
    shared_emote_privacy: EmotePrivacy | string;
    pet_preferences: { interactions: boolean; updated_at: string | null };
    discoveries: Discovery[];
    colors: CustomColors[];
    live: LiveState | null;
}

export type PlayerCatalogCosmetic = CatalogCosmetic & {
    variant_key?: string | null;
    asset_id?: number | null;
    slots?: string[];
    color_slots?: { name: string }[];
};

export type PlayerCatalog = Omit<Catalog, "cosmetics"> & { cosmetics: PlayerCatalogCosmetic[] };

const UUID = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
    return UUID.test(value.trim());
}

export function normalizeUuid(value: string): string {
    const hex = value.trim().replace(/-/g, "").toLowerCase();
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export class PlayerRequestError extends Error {
    constructor(
        message: string,
        readonly status: number,
    ) {
        super(message);
        this.name = "PlayerRequestError";
    }
}

export function describeFailure(
    request: "lookup" | "cosmetics",
    status: number,
    text: string,
    input = "",
): string {
    const detail = text.trim();
    if (status === 401) return "Your session has expired. Sign in again.";
    if (status === 403) return "You need the Manage cosmetics permission to view players.";
    if (status >= 500) {
        return detail
            ? `The server ran into an error (${status}): ${detail}`
            : `The server ran into an error (${status}). Try again in a bit.`;
    }
    if (request === "lookup" && status === 404) {
        return input
            ? `No player called "${input}" has signed in to PolyPlus yet.`
            : "No player with that name has signed in to PolyPlus yet.";
    }
    if (request === "lookup" && status === 400) return "Enter a username or UUID.";
    if (request === "cosmetics" && status === 404) return "No player with that UUID has signed in to PolyPlus yet.";
    if (request === "cosmetics" && status === 400) return "That isn't a valid UUID.";
    return detail || `Request failed (${status}).`;
}

const isObject = (value: unknown): value is Record<string, unknown> =>
    typeof value === "object" && value !== null && !Array.isArray(value);

const numberOr = <T>(value: unknown, fallback: T): number | T =>
    typeof value === "number" && Number.isFinite(value) ? value : fallback;

const stringOr = <T>(value: unknown, fallback: T): string | T => (typeof value === "string" ? value : fallback);

function numberRecord(value: unknown): Record<string, number> {
    if (!isObject(value)) return {};
    const out: Record<string, number> = {};
    for (const [key, entry] of Object.entries(value)) {
        if (typeof entry === "number" && Number.isFinite(entry)) out[key] = entry;
    }
    return out;
}

function parseDiscovery(value: unknown): Discovery | null {
    if (!isObject(value)) return null;
    const setId = numberOr(value.set_id, null);
    if (setId === null) return null;
    return {
        set_id: setId,
        name: stringOr(value.name, `Set #${setId}`),
        cosmetic_ids: Array.isArray(value.cosmetic_ids)
            ? value.cosmetic_ids.filter((id): id is number => typeof id === "number")
            : [],
        discovered_at: stringOr(value.discovered_at, ""),
        delivered_at: stringOr(value.delivered_at, null),
    };
}

function parseColors(value: unknown): CustomColors | null {
    if (!isObject(value)) return null;
    const cosmeticId = numberOr(value.cosmetic_id, null);
    if (cosmeticId === null) return null;
    return {
        cosmetic_id: cosmeticId,
        active: value.active === true,
        palette: numberRecord(value.palette),
        aura_default: value.aura_default === true,
    };
}

function parseBonus(value: unknown): BonusRef | null {
    if (!isObject(value)) return null;
    const id = numberOr(value.id, null);
    if (id === null) return null;
    const bonus: BonusRef = { id, hash: stringOr(value.hash, "") };
    if (typeof value.url === "string") bonus.url = value.url;
    return bonus;
}

function compact<T>(values: unknown, parse: (value: unknown) => T | null): T[] {
    if (!Array.isArray(values)) return [];
    return values.map(parse).filter((value): value is T => value !== null);
}

export function parsePlayerCosmetics(raw: unknown): PlayerCosmetics {
    if (!isObject(raw) || typeof raw.uuid !== "string") {
        throw new Error("The server sent a player response this page can't read.");
    }
    const pets = isObject(raw.pet_preferences) ? raw.pet_preferences : {};
    const live = isObject(raw.live) ? raw.live : null;
    return {
        uuid: raw.uuid,
        username: stringOr(raw.username, null),
        equipped: numberRecord(raw.equipped),
        particle_color: numberOr(raw.particle_color, null),
        shared_emote_privacy: stringOr(raw.shared_emote_privacy, "everyone"),
        pet_preferences: {
            interactions: pets.interactions !== false,
            updated_at: stringOr(pets.updated_at, null),
        },
        discoveries: compact(raw.discoveries, parseDiscovery),
        colors: compact(raw.colors, parseColors),
        live: live && {
            bonuses: compact(live.bonuses, parseBonus),
            active_emote_id: numberOr(live.active_emote_id, null),
        },
    };
}

export async function resolvePlayer(send: Send, input: string): Promise<string> {
    const value = input.trim();
    if (!value) throw new Error("Enter a username or UUID.");
    if (isUuid(value)) return normalizeUuid(value);
    const response = await send(playerLookupPath(value), { method: "GET" });
    const text = await response.text();
    if (!response.ok) {
        throw new PlayerRequestError(describeFailure("lookup", response.status, text, value), response.status);
    }
    const found = JSON.parse(text) as { uuid?: unknown };
    if (typeof found.uuid !== "string" || !isUuid(found.uuid)) throw new Error("The username lookup didn't return a UUID.");
    return normalizeUuid(found.uuid);
}

export function playerLookupPath(name: string): string {
    return `/v1/admin/players/lookup?name=${encodeURIComponent(name.trim())}`;
}

export function playerCosmeticsPath(uuid: string): string {
    return `/v1/admin/players/${encodeURIComponent(uuid.trim())}/cosmetics`;
}

export async function fetchPlayerCosmetics(send: Send, uuid: string): Promise<PlayerCosmetics> {
    const response = await send(playerCosmeticsPath(uuid), { method: "GET" });
    const text = await response.text();
    if (!response.ok) {
        throw new PlayerRequestError(describeFailure("cosmetics", response.status, text), response.status);
    }
    return parsePlayerCosmetics(JSON.parse(text));
}

export function usePlayerSend(): Send {
    const session = useSession();
    return (path, init) => apiFetch(session, path, init);
}

export function usePlayerCosmetics(uuid: string | undefined) {
    const session = useSession();
    const send = usePlayerSend();
    return useQuery({
        queryKey: ["players", session.env, uuid],
        queryFn: () => fetchPlayerCosmetics(send, uuid as string),
        enabled: uuid !== undefined,
        retry: false,
    });
}

export function findCosmetic(catalog: PlayerCatalog | undefined, id: number): PlayerCatalogCosmetic | undefined {
    return catalog?.cosmetics.find((cosmetic) => cosmetic.id === id);
}

export function cosmeticName(catalog: PlayerCatalog | undefined, id: number): string {
    const cosmetic = findCosmetic(catalog, id);
    if (!cosmetic) return `Cosmetic #${id}`;
    const group = cosmetic.group_id == null ? undefined : catalog?.groups.find((item) => item.id === cosmetic.group_id);
    const own = cosmetic.variant_name ?? cosmetic.name;
    if (group) return own && own !== group.name ? `${group.name} · ${own}` : group.name;
    return own ?? `Cosmetic #${id}`;
}

export interface EquippedRow {
    slot: string;
    label: string;
    cosmeticId: number;
    name: string;
    variantKey: string | null;
    cosmetic: PlayerCatalogCosmetic | undefined;
}

const slotLabel = (slot: string) =>
    PLAYER_SLOTS.find((entry) => entry.slot === slot)?.label ??
    slot.charAt(0).toUpperCase() + slot.slice(1).replace(/_/g, " ");

export function equippedRows(equipped: Record<string, number>, catalog: PlayerCatalog | undefined): EquippedRow[] {
    const known: string[] = PLAYER_SLOTS.map((entry) => entry.slot);
    const slots = [
        ...known.filter((slot) => slot in equipped),
        ...Object.keys(equipped)
            .filter((slot) => !known.includes(slot))
            .sort(),
    ];
    return slots.map((slot) => {
        const cosmeticId = equipped[slot];
        const cosmetic = findCosmetic(catalog, cosmeticId);
        return {
            slot,
            label: slotLabel(slot),
            cosmeticId,
            name: cosmeticName(catalog, cosmeticId),
            variantKey: cosmetic?.variant_key ?? null,
            cosmetic,
        };
    });
}

export function formatRgb(color: number): string {
    return `#${(color & 0xffffff).toString(16).padStart(6, "0")}`;
}

export interface Swatch {
    name: string;
    color: number | null;
}

export function paletteSwatches(entry: CustomColors, cosmetic: PlayerCatalogCosmetic | undefined): Swatch[] {
    const names = new Set([
        ...Object.keys(entry.palette),
        ...(cosmetic?.color_slots ?? []).map((slot) => slot.name),
    ]);
    return [...names]
        .sort((a, b) => a.localeCompare(b))
        .map((name) => ({ name, color: entry.palette[name] ?? null }));
}

export function formatTime(iso: string | null | undefined): string {
    if (!iso) return "Never";
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? iso : date.toLocaleString();
}

export function privacyLabel(privacy: string): string {
    return PRIVACY_LABELS[privacy as EmotePrivacy] ?? `Unknown setting (${privacy})`;
}

export function bonusName(
    id: number,
    sets: { id: number; name: string }[] | undefined,
    discoveries: Discovery[],
): string {
    return (
        sets?.find((set) => set.id === id)?.name ??
        discoveries.find((discovery) => discovery.set_id === id)?.name ??
        `Set #${id}`
    );
}
