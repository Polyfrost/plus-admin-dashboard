/** Shared by every analytics section. */

import type { UseQueryResult } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { formatNumber } from "@/lib/analytics";
import type { ChartSeries, TableData } from "@/components/viz";

/**
 * Error, pending, and loaded. `dimmed` is true while a fresh range is in
 * flight over data that is already on screen.
 */
export function SectionBody<T>({
    query,
    what,
    children,
}: {
    query: UseQueryResult<T>;
    what: string;
    children: (data: T, dimmed: boolean) => ReactNode;
}) {
    if (query.error) {
        return (
            <div className="rounded border border-red-700 bg-red-900/40 px-4 py-3 text-sm text-red-200">
                Failed to load {what}: {(query.error as Error).message}
            </div>
        );
    }
    if (!query.data) {
        return (
            <div className="rounded-lg bg-gray-800/60 px-4 py-6 text-sm text-gray-500">
                {query.isFetching
                    ? `Loading ${what}…`
                    : `Press Load to fetch ${what}.`}
            </div>
        );
    }
    return <>{children(query.data, query.isFetching)}</>;
}

/** A chart's data as a table: one row per x value, one column per series. */
export function seriesTable(
    firstColumn: string,
    labels: string[],
    series: ChartSeries[],
    format: (value: number) => string = formatNumber,
): TableData {
    return {
        columns: [firstColumn, ...series.map((one) => one.name)],
        rows: labels.map((label, index) => [
            label,
            ...series.map((one) => {
                const value = one.values[index];
                return value === null || value === undefined
                    ? "—"
                    : format(value);
            }),
        ]),
    };
}

export const TileGrid = ({ children }: { children: ReactNode }) => (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {children}
    </div>
);
