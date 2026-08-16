/**
 * Types and helpers for the `/v1/analytics/*` endpoints, mirroring the schemas
 * in the Poly+ API (v1) OpenAPI document.
 */

const ANALYTICS_PREFIX = "/v1/analytics";

/* ------------------------------------------------------------------ types */

export interface AnalyticsPeriod {
    start?: string | null;
    end?: string | null;
}

export interface OwnedItemsDistribution {
    "0": number;
    "1": number;
    "2_5": number;
    "6_10": number;
    "11_plus": number;
}

export interface OwnedItemsPerUser {
    total_owned_items: number;
    average_per_user: number;
    users_with_any: number;
    items_acquired: number;
    distribution: OwnedItemsDistribution;
}

export interface Playtime {
    total_seconds: number;
    average_seconds_per_user: number;
    last_30d_seconds: number;
    total_sessions: number;
}

export interface OverviewResponse {
    period: AnalyticsPeriod;
    total_users: number;
    new_users: number;
    monthly_active_users: number;
    owned_items_per_user: OwnedItemsPerUser;
    playtime: Playtime;
}

export interface DailyPoint {
    day: string;
    dau: number;
    wau: number;
    mau: number;
    new_users: number;
    returning_users: number;
    total_users: number;
    playtime_seconds: number;
    sessions: number;
    cosmetics_acquired: number;
    cosmetics_acquired_paid: number;
    cosmetics_acquired_granted: number;
    transactions_completed: number;
    transactions_refunded: number;
    gift_transactions: number;
    friend_requests_sent: number;
    friend_requests_accepted: number;
    friendships_created: number;
    blocks_created: number;
    messages_sent: number;
    game_sessions_created: number;
    session_invites_sent: number;
    session_invites_accepted: number;
    tracked_link_hits: number;
}

export interface DailyResponse {
    start: string;
    end: string;
    /** Last day the rollup job treats as final; later rows still move. */
    computed_through?: string | null;
    days: DailyPoint[];
}

export interface RetentionPoint {
    day_offset: number;
    retained: number;
    /** `retained / cohort_size`, in 0.0..=1.0. */
    rate: number;
}

export interface RetentionCohort {
    cohort_day: string;
    cohort_size: number;
    offsets: RetentionPoint[];
}

export interface RetentionResponse {
    start: string;
    end: string;
    cohorts: RetentionCohort[];
}

export interface HeatmapCell {
    /** ISO weekday, 1 = Monday. */
    dow: number;
    /** UTC hour, 0-23. */
    hour_of_day: number;
    playtime_seconds: number;
    /** Summed across the weeks in the period, so not a distinct player count. */
    active_players: number;
    sessions_started: number;
    peak_concurrent: number;
}

export interface ActivityPoint {
    hour_start: string;
    playtime_seconds: number;
    active_players: number;
    sessions_started: number;
    peak_concurrent: number;
}

export interface ActivityResponse {
    start: string;
    end: string;
    /** Populated when `shape=heatmap`. */
    heatmap?: HeatmapCell[] | null;
    /** Populated when `shape=series`. */
    series?: ActivityPoint[] | null;
    /** The busiest bucket by active players, if there was any activity. */
    busiest?: HeatmapCell | null;
}

export interface SessionLengthBucket {
    min_seconds: number;
    /** Absent on the final, open-ended bucket. */
    max_seconds?: number | null;
    sessions: number;
}

export interface SessionPercentiles {
    p50_seconds?: number | null;
    p90_seconds?: number | null;
    p99_seconds?: number | null;
}

export interface PeakConcurrent {
    players: number;
    hour_start: string;
}

export interface SessionsResponse {
    start: string;
    end: string;
    sessions: number;
    percentiles: SessionPercentiles;
    distribution: SessionLengthBucket[];
    peak_concurrent?: PeakConcurrent | null;
}

export type CatalogSort = "views" | "acquisitions" | "conversion";

export interface CatalogEntry {
    cosmetic_id: number;
    name?: string | null;
    views: number;
    acquisitions: number;
    acquisitions_paid: number;
    acquisitions_granted: number;
    /** `acquisitions / views`, absent when the cosmetic was never viewed. */
    conversion?: number | null;
    /** From the most recent weekly snapshot at or before `end`. */
    owners?: number | null;
    equipped?: number | null;
    /** `equipped / owners`: how many owners actually wear it. */
    shelf_rate?: number | null;
}

export interface CatalogResponse {
    start: string;
    end: string;
    cosmetics: CatalogEntry[];
}

export interface MonetizationDay {
    day: string;
    gross_revenue_minor: number;
    refund_amount_minor: number;
    discount_amount_minor: number;
    transactions_completed: number;
    transactions_refunded: number;
    paying_users: number;
    gift_transactions: number;
}

export interface MonetizationResponse {
    start: string;
    end: string;
    gross_revenue_minor: number;
    refund_amount_minor: number;
    /**
     * Gross booked in the period minus refunds processed in it. A refund is
     * booked on the day it was processed, not the day of the original sale.
     */
    net_revenue_minor: number;
    discount_amount_minor: number;
    /** Sales made in the period, including ones refunded later. */
    transactions_completed: number;
    /** Sales made in the period that have since been refunded. */
    transactions_refunded: number;
    gift_transactions: number;
    /** Distinct payers per day, summed. Not distinct across the period. */
    paying_user_days: number;
    days: MonetizationDay[];
}

export interface ClientBreakdown {
    /** Empty when the client did not report this field. */
    value: string;
    /** Summed across days, so a player active on several days counts once per day. */
    player_days: number;
}

export interface ClientsResponse {
    start: string;
    end: string;
    client_versions: ClientBreakdown[];
    minecraft_versions: ClientBreakdown[];
    loaders: ClientBreakdown[];
    operating_systems: ClientBreakdown[];
}

export interface HealthResponse {
    rolled_up_days: number;
    finalized_through?: string | null;
    last_run_at?: string | null;
    last_run_ms?: number | null;
    last_error?: string | null;
    /** Days between the watermark and today. */
    watermark_age_days?: number | null;
}

/* ------------------------------------------------------------------ fetch */

export type QueryParams = Record<string, string | number | null | undefined>;

export async function analyticsGet<T>(
    env: string,
    password: string,
    path: string,
    params: QueryParams = {},
): Promise<T> {
    const url = new URL(`${ANALYTICS_PREFIX}${path}`, env);
    for (const [key, value] of Object.entries(params)) {
        if (value === null || value === undefined || value === "") continue;
        url.searchParams.set(key, String(value));
    }

    const res = await fetch(url, { headers: { Authorization: password } });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`${res.status} ${text}`.trim());
    }
    return (await res.json()) as T;
}

/* ------------------------------------------------------------------ dates */

/** Today as a `YYYY-MM-DD` UTC day — the same calendar the API buckets on. */
export function utcToday(): string {
    return new Date().toISOString().slice(0, 10);
}

export function shiftDay(day: string, delta: number): string {
    const date = new Date(`${day}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + delta);
    return date.toISOString().slice(0, 10);
}

export function utcMonthStart(): string {
    return `${utcToday().slice(0, 7)}-01`;
}

/** Inclusive day count, so a single day spans 1. */
export function daySpan(start: string, end: string): number {
    const from = Date.parse(`${start}T00:00:00Z`);
    const to = Date.parse(`${end}T00:00:00Z`);
    if (Number.isNaN(from) || Number.isNaN(to)) return 0;
    return Math.floor((to - from) / 86_400_000) + 1;
}

/* -------------------------------------------------------------- formatting */

export function formatNumber(value: number): string {
    return value.toLocaleString();
}

export function formatCompact(value: number): string {
    if (Math.abs(value) < 1000) {
        return Number.isInteger(value) ? String(value) : value.toFixed(1);
    }
    return value.toLocaleString(undefined, {
        notation: "compact",
        maximumFractionDigits: 1,
    });
}

export function formatDuration(totalSeconds: number): string {
    const seconds = Math.max(0, Math.round(totalSeconds));
    if (seconds < 60) return `${seconds}s`;

    const days = Math.floor(seconds / 86_400);
    const hours = Math.floor((seconds % 86_400) / 3_600);
    const minutes = Math.floor((seconds % 3_600) / 60);

    const parts: string[] = [];
    if (days) parts.push(`${days}d`);
    if (hours) parts.push(`${hours}h`);
    if (minutes && !days) parts.push(`${minutes}m`);
    return parts.join(" ") || `${seconds}s`;
}

/** Seconds as fractional hours — the unit playtime charts are plotted in. */
export function toHours(seconds: number): number {
    return seconds / 3_600;
}

export function formatHours(hours: number): string {
    const rounded = Math.round(hours * 10) / 10;
    return `${rounded.toLocaleString(undefined, { maximumFractionDigits: 1 })}h`;
}

export function percent(part: number, whole: number): string {
    if (whole <= 0) return "0%";
    return `${((part / whole) * 100).toFixed(1)}%`;
}

/** A 0..1 rate as a percentage. */
export function formatRate(rate: number, digits = 1): string {
    return `${(rate * 100).toFixed(digits)}%`;
}

/**
 * Minor units as a major-unit amount. The API does not report which currency
 * the amounts are in, so no symbol is attached.
 */
export function formatMinor(minor: number): string {
    return (minor / 100).toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

export function formatDayLabel(day: string): string {
    const date = new Date(`${day}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) return day;
    return date.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
    });
}

export function formatDateTime(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
    });
}

export const WEEKDAYS = [
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
    "Sunday",
] as const;

/** ISO weekday (1 = Monday) as a short name. */
export function weekdayName(dow: number): string {
    return WEEKDAYS[(dow - 1 + 7) % 7] ?? String(dow);
}

export function formatHourOfDay(hour: number): string {
    return `${String(hour).padStart(2, "0")}:00`;
}

/** A session-length bucket as a readable range, e.g. `5–15m` or `4h+`. */
export function formatBucketLabel(bucket: SessionLengthBucket): string {
    const label = (seconds: number) =>
        seconds >= 3_600
            ? `${Math.round(seconds / 3_600)}h`
            : `${Math.round(seconds / 60)}m`;

    if (bucket.max_seconds === null || bucket.max_seconds === undefined) {
        return `${label(bucket.min_seconds)}+`;
    }
    return `${label(bucket.min_seconds)}–${label(bucket.max_seconds)}`;
}
