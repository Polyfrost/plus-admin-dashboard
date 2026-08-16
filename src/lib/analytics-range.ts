/** The date range every analytics query is scoped by. */

import { formatDayLabel, shiftDay, utcMonthStart, utcToday } from "@/lib/analytics";

export const RANGE_PRESETS = [
    { id: "7d", label: "Last 7 days" },
    { id: "30d", label: "Last 30 days" },
    { id: "90d", label: "Last 90 days" },
    { id: "mtd", label: "Month to date" },
    { id: "all", label: "All time" },
    { id: "custom", label: "Custom range" },
] as const;

export type RangeId = (typeof RANGE_PRESETS)[number]["id"];

export interface Range {
    start: string | null;
    end: string | null;
}

/** The hourly shape is capped at 1000 points server-side. */
export const MAX_HOURLY_SPAN_DAYS = 41;

export function resolveRange(id: RangeId, start: string, end: string): Range {
    const today = utcToday();
    switch (id) {
        case "7d":
            return { start: shiftDay(today, -6), end: today };
        case "30d":
            return { start: shiftDay(today, -29), end: today };
        case "90d":
            return { start: shiftDay(today, -89), end: today };
        case "mtd":
            return { start: utcMonthStart(), end: today };
        case "all":
            // Both bounds omitted: the overview answers all-time, and every
            // other endpoint falls back to its own documented default window.
            return { start: null, end: null };
        case "custom":
            return { start: start || null, end: end || null };
    }
}

export function rangeLabel(start?: string | null, end?: string | null): string {
    if (!start && !end) return "All time";
    if (start && end) {
        return `${formatDayLabel(start)} – ${formatDayLabel(end)} (UTC)`;
    }
    return start
        ? `From ${formatDayLabel(start)}`
        : `Until ${formatDayLabel(end!)}`;
}
