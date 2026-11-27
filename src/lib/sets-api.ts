import { useAdminMutation, useAdminQuery, type Catalog, type CatalogCosmetic } from "@/lib/store-api";
import { parseUploadOutcome, type BundleAnalysis, type Issue } from "@/lib/cosmetics-api";

export const MAX_SET_NAME = 64;
export const MAX_REQUIREMENTS = 8;
export const MAX_VARIANT_KEY = 64;
export const MAX_PREVIEW_ITEMS = 32;
export const MAX_EFFECT_BYTES = 4 * 1024 * 1024;
export const MAX_ACTIVE_BONUSES = 2;

const I32_MIN = -2147483648;
const I32_MAX = 2147483647;

export interface SetRequirement {
    cosmetic_id?: number;
    group_id?: number;
    variant_key?: string;
}

export interface SetBody {
    name: string;
    priority: number;
    effect_asset_id: number | null;
    active_from: string | null;
    active_until: string | null;
    requirements: SetRequirement[];
}

export interface SetInfo {
    id: number;
    name: string;
    priority: number;
    effect_asset_id: number | null;
    effect_url: string | null;
    active_from: string | null;
    active_until: string | null;
    created_at: string;
    requirements: SetRequirement[];
}

export type RequirementDraft =
    | { kind: "cosmetic"; cosmeticId: number | null }
    | { kind: "group"; groupId: number | null }
    | { kind: "variant"; groupId: number | null; variantKey: string };

export interface SetDraft {
    name: string;
    priority: string;
    effectAssetId: number | null;
    activeFrom: string | null;
    activeUntil: string | null;
    requirements: RequirementDraft[];
}

export type BuildResult = { ok: true; body: SetBody } | { ok: false; error: string };

const charCount = (value: string) => [...value].length;

export function emptyDraft(): SetDraft {
    return {
        name: "",
        priority: "0",
        effectAssetId: null,
        activeFrom: null,
        activeUntil: null,
        requirements: [{ kind: "cosmetic", cosmeticId: null }],
    };
}

export function draftFromSet(set: SetInfo): SetDraft {
    return {
        name: set.name,
        priority: String(set.priority),
        effectAssetId: set.effect_asset_id,
        activeFrom: set.active_from,
        activeUntil: set.active_until,
        requirements: set.requirements.map((requirement): RequirementDraft => {
            if (requirement.group_id == null) {
                return { kind: "cosmetic", cosmeticId: requirement.cosmetic_id ?? null };
            }
            if (requirement.variant_key != null) {
                return { kind: "variant", groupId: requirement.group_id, variantKey: requirement.variant_key };
            }
            return { kind: "group", groupId: requirement.group_id };
        }),
    };
}

function buildRequirement(draft: RequirementDraft, index: number): SetRequirement | string {
    const position = `Requirement ${index + 1}`;
    if (draft.kind === "cosmetic") {
        if (draft.cosmeticId == null) return `${position} needs a cosmetic.`;
        return { cosmetic_id: draft.cosmeticId };
    }
    if (draft.groupId == null) return `${position} needs a group.`;
    if (draft.kind === "group") return { group_id: draft.groupId };
    const key = draft.variantKey.trim();
    if (!key) return `${position} needs a variant key.`;
    if (charCount(key) > MAX_VARIANT_KEY) {
        return `${position} has a variant key over ${MAX_VARIANT_KEY} characters.`;
    }
    return { group_id: draft.groupId, variant_key: key };
}

export function buildSetBody(draft: SetDraft): BuildResult {
    const name = draft.name.trim();
    if (!name) return { ok: false, error: "Give the set a name." };
    if (charCount(name) > MAX_SET_NAME) {
        return { ok: false, error: `Names can be at most ${MAX_SET_NAME} characters.` };
    }

    const priorityText = draft.priority.trim();
    const priority = priorityText === "" ? 0 : Number(priorityText);
    if (!Number.isInteger(priority) || priority < I32_MIN || priority > I32_MAX) {
        return { ok: false, error: "Priority must be a whole number." };
    }

    if (draft.requirements.length === 0) {
        return { ok: false, error: "A set needs at least one requirement." };
    }
    if (draft.requirements.length > MAX_REQUIREMENTS) {
        return { ok: false, error: `A set can have at most ${MAX_REQUIREMENTS} requirements.` };
    }

    const activeFrom = draft.activeFrom || null;
    const activeUntil = draft.activeUntil || null;
    for (const [label, value] of [
        ["start", activeFrom],
        ["end", activeUntil],
    ] as const) {
        if (value !== null && Number.isNaN(Date.parse(value))) {
            return { ok: false, error: `The ${label} date isn't a valid date.` };
        }
    }
    if (activeFrom !== null && activeUntil !== null && Date.parse(activeFrom) >= Date.parse(activeUntil)) {
        return { ok: false, error: "The set has to end after it starts." };
    }

    const requirements: SetRequirement[] = [];
    for (const [index, requirement] of draft.requirements.entries()) {
        const built = buildRequirement(requirement, index);
        if (typeof built === "string") return { ok: false, error: built };
        requirements.push(built);
    }

    return {
        ok: true,
        body: {
            name,
            priority,
            effect_asset_id: draft.effectAssetId,
            active_from: activeFrom,
            active_until: activeUntil,
            requirements,
        },
    };
}

export type WindowStatus = "always" | "scheduled" | "live" | "ended";

export function windowStatus(
    set: Pick<SetInfo, "active_from" | "active_until">,
    now: number = Date.now(),
): WindowStatus {
    const from = set.active_from ? Date.parse(set.active_from) : null;
    const until = set.active_until ? Date.parse(set.active_until) : null;
    if (until !== null && now >= until) return "ended";
    if (from !== null && now < from) return "scheduled";
    if (from === null && until === null) return "always";
    return "live";
}

export function nextBoundary(
    sets: Pick<SetInfo, "active_from" | "active_until">[],
    now: number = Date.now(),
): number | null {
    let next: number | null = null;
    for (const set of sets) {
        for (const value of [set.active_from, set.active_until]) {
            if (!value) continue;
            const at = Date.parse(value);
            if (Number.isNaN(at) || at <= now) continue;
            if (next === null || at < next) next = at;
        }
    }
    return next;
}

export const MAX_TIMER_DELAY = 2_147_483_647;

export function boundaryDelay(
    sets: Pick<SetInfo, "active_from" | "active_until">[],
    now: number = Date.now(),
): number | null {
    const next = nextBoundary(sets, now);
    if (next === null) return null;
    return Math.min(next - now, MAX_TIMER_DELAY);
}

export function checkEffectFile(file: { name: string; size: number }): string | null {
    if (!file.name.toLowerCase().endsWith(".zip")) return "Pick a .zip effect bundle.";
    if (file.size > MAX_EFFECT_BYTES) {
        return `That file is ${(file.size / 1024 / 1024).toFixed(1)} MiB. Effects can be at most 4 MiB.`;
    }
    return null;
}

export interface BonusRef {
    id: number;
    url?: string;
    hash: string;
}

export type Send = (path: string, init: RequestInit) => Promise<Response>;

export function comboIds(ids: number[]): number[] {
    const unique = [...new Set(ids)];
    if (unique.length > MAX_PREVIEW_ITEMS) {
        throw new Error(`Pick at most ${MAX_PREVIEW_ITEMS} cosmetics.`);
    }
    return unique;
}

export async function previewBonuses(send: Send, ids: number[]): Promise<BonusRef[]> {
    const cosmetic_ids = comboIds(ids);
    const response = await send(`${SETS_PATH}/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cosmetic_ids }),
    });

    const text = await response.text();
    if (!response.ok) {
        if (response.status === 503) throw new Error("Bonuses are unavailable right now. Try again in a bit.");
        throw new Error(text.trim() || `Request failed (${response.status})`);
    }
    const parsed = JSON.parse(text) as { bonuses?: BonusRef[] };
    return parsed.bonuses ?? [];
}

export type CatalogWithKeys = Omit<Catalog, "cosmetics"> & {
    cosmetics: (CatalogCosmetic & { variant_key?: string | null })[];
};

export function cosmeticLabel(catalog: Catalog | undefined, id: number): string {
    const cosmetic = catalog?.cosmetics.find((item) => item.id === id);
    if (!cosmetic) return `Cosmetic #${id}`;
    const group = cosmetic.group_id == null ? undefined : catalog?.groups.find((item) => item.id === cosmetic.group_id);
    if (group) return `${group.name} · ${cosmetic.variant_name ?? cosmetic.name ?? `#${id}`}`;
    return cosmetic.name ?? `Cosmetic #${id}`;
}

export function hiddenNote(catalog: Catalog | undefined, cosmetic: CatalogCosmetic): string | null {
    if (!cosmetic.enabled) return "hidden";
    const group = cosmetic.group_id == null ? undefined : catalog?.groups.find((item) => item.id === cosmetic.group_id);
    return group && !group.enabled ? "group hidden" : null;
}

export function groupLabel(catalog: Catalog | undefined, id: number): string {
    return catalog?.groups.find((group) => group.id === id)?.name ?? `Group #${id}`;
}

export function requirementLabel(catalog: Catalog | undefined, requirement: SetRequirement): string {
    if (requirement.group_id == null) return cosmeticLabel(catalog, requirement.cosmetic_id ?? 0);
    const group = groupLabel(catalog, requirement.group_id);
    return requirement.variant_key == null ? `${group} (any variant)` : `${group} · ${requirement.variant_key}`;
}

export function variantKeys(catalog: CatalogWithKeys | undefined, groupId: number | null): string[] {
    if (!catalog || groupId == null) return [];
    const keys = catalog.cosmetics
        .filter((cosmetic) => cosmetic.group_id === groupId && cosmetic.variant_key)
        .map((cosmetic) => cosmetic.variant_key as string);
    return [...new Set(keys)].sort();
}

export type Combo = { ok: true; ids: number[] } | { ok: false; error: string };

export const COMBO_BUDGET = 100000;

export function slotsFit(items: ReadonlyArray<readonly string[] | null>): boolean {
    const known = items.filter((slots): slots is readonly string[] => slots !== null);
    const holders = new Map<string, number>();
    const claim = (item: number, tried: Set<string>): boolean => {
        for (const slot of known[item]) {
            if (tried.has(slot)) continue;
            tried.add(slot);
            const holder = holders.get(slot);
            if (holder === undefined || claim(holder, tried)) {
                holders.set(slot, item);
                return true;
            }
        }
        return false;
    };
    return known.every((_, item) => claim(item, new Set()));
}

const specificity = (requirement: SetRequirement) =>
    requirement.group_id == null ? 0 : requirement.variant_key == null ? 2 : 1;

export function repeatedCosmetic(requirements: SetRequirement[]): number | null {
    const seen = new Set<number>();
    for (const requirement of requirements) {
        if (requirement.group_id != null || requirement.cosmetic_id == null) continue;
        if (seen.has(requirement.cosmetic_id)) return requirement.cosmetic_id;
        seen.add(requirement.cosmetic_id);
    }
    return null;
}

export function repeatWarning(catalog: Catalog | undefined, requirements: SetRequirement[]): string | null {
    const repeated = repeatedCosmetic(requirements);
    if (repeated === null) return null;
    return `This set lists ${cosmeticLabel(catalog, repeated)} more than once. Each requirement has to be met by a different cosmetic, so nobody can complete it.`;
}

const slotKey = (slots: readonly string[] | null) => (slots === null ? "?" : [...slots].sort().join(","));

function unionSlots(ids: number[], slotsOf: (id: number) => readonly string[] | null): readonly string[] | null {
    const union = new Set<string>();
    for (const id of ids) {
        const slots = slotsOf(id);
        if (slots === null) return null;
        for (const slot of slots) union.add(slot);
    }
    return [...union];
}

export function comboForSet(set: SetInfo, catalog: CatalogWithKeys | undefined, budget: number = COMBO_BUDGET): Combo {
    const cosmetics = catalog?.cosmetics ?? [];
    const slotTable = new Map(cosmetics.map((cosmetic) => [cosmetic.id, cosmetic.slots ?? null] as const));
    const slotsOf = (id: number) => slotTable.get(id) ?? null;
    const repeat = repeatWarning(catalog, set.requirements);
    if (repeat) return { ok: false, error: repeat };
    const wanted = set.requirements
        .map((requirement, index) => ({ requirement, index }))
        .filter(({ requirement }) => requirement.group_id != null || requirement.cosmetic_id != null);
    const options = wanted.map(({ requirement }) => {
        if (requirement.group_id == null) return [requirement.cosmetic_id as number];
        return cosmetics
            .filter(
                (cosmetic) =>
                    cosmetic.group_id === requirement.group_id &&
                    (requirement.variant_key == null || cosmetic.variant_key === requirement.variant_key),
            )
            .sort((a, b) => a.variant_order - b.variant_order || a.id - b.id)
            .map((cosmetic) => cosmetic.id);
    });
    const empty = options.findIndex((ids) => !ids.length);
    if (empty >= 0) {
        return { ok: false, error: `Nothing in the catalog matches ${requirementLabel(catalog, wanted[empty].requirement)}.` };
    }
    if (!slotsFit(options.map((ids) => ids.map(String)))) {
        return {
            ok: false,
            error: "Some of these requirements can only be met by the same cosmetic. Each one needs its own, so nobody can complete this set.",
        };
    }

    const appearances = new Map<number, number>();
    for (const ids of options) for (const id of ids) appearances.set(id, (appearances.get(id) ?? 0) + 1);
    const picks: number[] = new Array(wanted.length);
    let steps = 0;
    let gaveUp = false;
    const search = (remaining: number[], taken: number[]): boolean => {
        if (!remaining.length) return true;
        const takenSlots = taken.map(slotsOf);
        const viable: number[][] = [];
        let best = 0;
        for (const [position, at] of remaining.entries()) {
            const fits: number[] = [];
            for (const id of options[at]) {
                if (taken.includes(id)) continue;
                if (++steps > budget) {
                    gaveUp = true;
                    return false;
                }
                if (slotsFit([...takenSlots, slotsOf(id)])) fits.push(id);
            }
            if (!fits.length) return false;
            viable.push(fits);
            const current = remaining[best];
            if (
                fits.length < viable[best].length ||
                (fits.length === viable[best].length &&
                    specificity(wanted[at].requirement) < specificity(wanted[current].requirement))
            ) {
                best = position;
            }
        }
        if (!slotsFit([...takenSlots, ...viable.map((ids) => unionSlots(ids, slotsOf))])) return false;

        const at = remaining[best];
        const rest = remaining.filter((_, position) => position !== best);
        const failed = new Set<string>();
        for (const id of viable[best]) {
            const interchangeable = appearances.get(id) === 1;
            const key = slotKey(slotsOf(id));
            if (interchangeable && failed.has(key)) continue;
            picks[at] = id;
            if (search(rest, [...taken, id])) return true;
            if (gaveUp) return false;
            if (interchangeable) failed.add(key);
        }
        return false;
    };
    if (search(wanted.map((_, at) => at), [])) return { ok: true, ids: picks };
    if (gaveUp) {
        return {
            ok: false,
            error: "There are too many variant mixes to check, so Fill gave up. The set may still work: pick the cosmetics by hand.",
        };
    }
    return {
        ok: false,
        error: "These cosmetics can't all be worn at once: there's no mix of variants that puts each one in its own slot.",
    };
}

export const SETS_PATH = "/cosmetics/manage/sets";

export function useSets() {
    return useAdminQuery<SetInfo[]>(SETS_PATH);
}

export function useSaveSet() {
    return useAdminMutation<{ id?: number; body: SetBody }>(({ id, body }) => ({
        method: "POST",
        path: id === undefined ? `${SETS_PATH}/create` : `${SETS_PATH}/update`,
        body: id === undefined ? body : { id, ...body },
    }));
}

export function useDeleteSet() {
    return useAdminMutation<number>((id) => ({
        method: "POST",
        path: `${SETS_PATH}/delete`,
        body: { id },
    }));
}

export interface EffectOutcome {
    warnings: Issue[];
    analysis: BundleAnalysis | null;
}

export function effectOutcome(response: unknown): EffectOutcome {
    const { warnings, analysis } = parseUploadOutcome(response);
    return { warnings, analysis };
}

export function useUploadSetEffect() {
    return useAdminMutation<{ setId: number; file: File }>(({ setId, file }) => {
        const form = new FormData();
        form.append("set_id", String(setId));
        form.append("file", file, file.name);
        return { method: "POST", path: `${SETS_PATH}/effect`, body: form };
    });
}
