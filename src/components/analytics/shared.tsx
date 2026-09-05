/** Shared by every analytics section. */

import type { UseQueryResult } from "@tanstack/react-query";
import { Component, type ReactNode } from "react";
import { formatNumber } from "@/lib/analytics";
import type { ChartSeries, TableData } from "@/components/viz";

/** A figure the API may not report at all, as opposed to reporting a zero. */
export function optional(
    value: number | null | undefined,
    format: (value: number) => string = formatNumber,
): string {
    return value === null || value === undefined ? "—" : format(value);
}

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
    return (
        // An older deployment can answer a shape this dashboard no longer
        // expects; that should cost one section, not the whole page.
        <SectionErrorBoundary what={what} resetKey={query.dataUpdatedAt}>
            <SectionContent
                data={query.data}
                dimmed={query.isFetching}
                render={children}
            />
        </SectionErrorBoundary>
    );
}

/**
 * The render prop has to run one level below the boundary — a call made while
 * building the boundary's own element throws before it can catch anything.
 */
function SectionContent<T>({
    data,
    dimmed,
    render,
}: {
    data: T;
    dimmed: boolean;
    render: (data: T, dimmed: boolean) => ReactNode;
}) {
    return <>{render(data, dimmed)}</>;
}

class SectionErrorBoundary extends Component<
    { what: string; resetKey: number; children: ReactNode },
    { error: Error | null }
> {
    state: { error: Error | null } = { error: null };

    static getDerivedStateFromError(error: Error) {
        return { error };
    }

    componentDidUpdate(previous: { resetKey: number }) {
        // A fresh answer deserves a fresh attempt at rendering it.
        if (previous.resetKey !== this.props.resetKey && this.state.error) {
            this.setState({ error: null });
        }
    }

    render() {
        if (!this.state.error) return this.props.children;
        return (
            <div className="rounded border border-amber-700 bg-amber-900/30 px-4 py-3 text-sm text-amber-200">
                Could not render {this.props.what}: {this.state.error.message}.
                This environment may be running an API older than this
                dashboard.
            </div>
        );
    }
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
