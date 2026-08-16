import { useState, type ReactNode } from "react";
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    Legend,
    Line,
    LineChart as RechartsLineChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
} from "recharts";
import { formatCompact } from "@/lib/analytics";

/** Categorical slots, assigned in order and never cycled. */
export const SERIES_COLORS = [
    "#3987e5", // 1 blue
    "#d95926", // 2 orange
    "#199e70", // 3 aqua
    "#c98500", // 4 yellow
    "#d55181", // 5 magenta
    "#008300", // 6 green
    "#9085e9", // 7 violet
    "#e66767", // 8 red
] as const;

/** Sequential blue ramp, near-surface → bright, for magnitude on the heatmap. */
const SEQUENTIAL = [
    "#0d366b",
    "#104281",
    "#184f95",
    "#1c5cab",
    "#256abf",
    "#2a78d6",
    "#3987e5",
    "#5598e7",
    "#6da7ec",
    "#86b6ef",
    "#9ec5f4",
    "#b7d3f6",
    "#cde2fb",
] as const;

const INK = {
    empty: "#232f3f", // a heat cell holding zero
    grid: "#364153", // gray-700
    axis: "#4a5565", // gray-600
    muted: "#99a1af", // gray-400
};

export interface ChartSeries {
    key: string;
    name: string;
    color: string;
    values: (number | null)[];
}

/** A 0..1 magnitude as a step of the sequential ramp. */
export function heatFill(ratio: number): string {
    if (!Number.isFinite(ratio) || ratio <= 0) return INK.empty;
    const step = Math.min(
        SEQUENTIAL.length - 1,
        Math.floor(ratio * (SEQUENTIAL.length - 1)),
    );
    return SEQUENTIAL[step];
}

/** Ink for a label sitting inside a heat cell, flipped to clear its fill. */
export function heatInk(ratio: number): string {
    return !Number.isFinite(ratio) || ratio < 0.55 ? "#e5e7eb" : "#0b1220";
}

/* ------------------------------------------------------------------ charts */

/** `labels` + `series` as the row-per-x-value shape Recharts reads. */
function toRows(labels: string[], series: ChartSeries[]) {
    return labels.map((label, index) => {
        const row: Record<string, string | number | null> = { label };
        for (const one of series) row[one.key] = one.values[index] ?? null;
        return row;
    });
}

/**
 * The entrance animation is off deliberately: under StrictMode's
 * mount-unmount-remount it gets cancelled and never restarts, leaving every
 * series clipped to a few pixels of its own width.
 */
const STATIC = { isAnimationActive: false } as const;

const axisProps = {
    stroke: INK.axis,
    tick: { fill: INK.muted, fontSize: 11 },
    tickLine: false,
} as const;

/**
 * Grid, axes, tooltip and legend, shared by both chart types. Returns a
 * fragment rather than a component because Recharts discovers these by
 * inspecting its own children, and it does not look inside custom ones.
 */
function chrome({
    formatValue,
    formatTick,
    seriesCount,
    cursor,
}: {
    formatValue: (value: number) => string;
    formatTick: (value: number) => string;
    seriesCount: number;
    cursor?: object;
}) {
    return (
        <>
            <CartesianGrid stroke={INK.grid} vertical={false} />
            <XAxis dataKey="label" interval="preserveStartEnd" {...axisProps} />
            <YAxis tickFormatter={formatTick} width={56} {...axisProps} />
            <Tooltip
                cursor={cursor}
                formatter={(value) => formatValue(Number(value))}
                contentStyle={{
                    background: "#101828",
                    border: `1px solid ${INK.grid}`,
                    borderRadius: 6,
                }}
                labelStyle={{ color: INK.muted }}
            />
            {seriesCount > 1 && <Legend />}
        </>
    );
}

function EmptyPlot({ height }: { height: number }) {
    return (
        <div
            className="flex items-center justify-center text-sm text-gray-500"
            style={{ height }}
        >
            No data in this range.
        </div>
    );
}

interface PlotProps {
    labels: string[];
    series: ChartSeries[];
    height?: number;
    /** Full precision, used by the tooltip. */
    formatValue?: (value: number) => string;
    /** Terse, used by the y-axis ticks. */
    formatTick?: (value: number) => string;
}

export function LineChart({
    labels,
    series,
    height = 240,
    formatValue = (value) => value.toLocaleString(),
    formatTick = formatCompact,
    /** Wash the area under a single series. Ignored for multi-series charts. */
    area = false,
}: PlotProps & { area?: boolean }) {
    if (labels.length === 0) return <EmptyPlot height={height} />;

    const rows = toRows(labels, series);
    const parts = chrome({
        formatValue,
        formatTick,
        seriesCount: series.length,
    });

    return (
        <ResponsiveContainer width="100%" height={height}>
            {area && series.length === 1 ? (
                <AreaChart data={rows}>
                    {parts}
                    <Area
                        dataKey={series[0].key}
                        name={series[0].name}
                        stroke={series[0].color}
                        fill={series[0].color}
                        fillOpacity={0.15}
                        strokeWidth={2}
                        dot={false}
                        connectNulls={false}
                        {...STATIC}
                    />
                </AreaChart>
            ) : (
                <RechartsLineChart data={rows}>
                    {parts}
                    {series.map((one) => (
                        <Line
                            key={one.key}
                            dataKey={one.key}
                            name={one.name}
                            stroke={one.color}
                            strokeWidth={2}
                            dot={false}
                            connectNulls={false}
                            {...STATIC}
                        />
                    ))}
                </RechartsLineChart>
            )}
        </ResponsiveContainer>
    );
}

export function ColumnChart({
    labels,
    series,
    stacked = false,
    height = 240,
    formatValue = (value) => value.toLocaleString(),
    formatTick = formatCompact,
}: PlotProps & { stacked?: boolean }) {
    if (labels.length === 0) return <EmptyPlot height={height} />;

    return (
        <ResponsiveContainer width="100%" height={height}>
            <BarChart data={toRows(labels, series)}>
                {chrome({
                    formatValue,
                    formatTick,
                    seriesCount: series.length,
                    cursor: { fill: "#ffffff", fillOpacity: 0.04 },
                })}
                {series.map((one) => (
                    <Bar
                        key={one.key}
                        dataKey={one.key}
                        name={one.name}
                        fill={one.color}
                        stackId={stacked ? "stack" : undefined}
                        radius={stacked ? undefined : [4, 4, 0, 0]}
                        maxBarSize={24}
                        {...STATIC}
                    />
                ))}
            </BarChart>
        </ResponsiveContainer>
    );
}

/* -------------------------------------------------------------- bar lists */

interface BarItem {
    key: string;
    label: string;
    value: number;
    sub?: string;
}

export function HBarList({
    items,
    formatValue = (value) => value.toLocaleString(),
    color = SERIES_COLORS[0],
    empty = "Nothing reported in this range.",
}: {
    items: BarItem[];
    formatValue?: (value: number) => string;
    color?: string;
    empty?: string;
}) {
    if (items.length === 0) {
        return <div className="text-sm text-gray-500">{empty}</div>;
    }

    const max = Math.max(1, ...items.map((item) => item.value));

    return (
        <div className="flex flex-col gap-2.5">
            {items.map((item) => (
                <div key={item.key} className="flex flex-col gap-1">
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="truncate text-gray-300">
                            {item.label}
                        </span>
                        <span className="shrink-0 tabular-nums text-gray-400">
                            {formatValue(item.value)}
                            {item.sub && (
                                <span className="ml-1 text-gray-500">
                                    {item.sub}
                                </span>
                            )}
                        </span>
                    </div>
                    <div className="h-2 rounded-sm bg-gray-700/60">
                        <div
                            className="h-full rounded-r-sm"
                            style={{
                                width: `${Math.max((item.value / max) * 100, item.value > 0 ? 1.5 : 0)}%`,
                                background: color,
                            }}
                        />
                    </div>
                </div>
            ))}
        </div>
    );
}

/* ---------------------------------------------------------------- heatmap */

/**
 * A weekday × hour grid. Recharts has no heatmap, so this stays a CSS grid and
 * the per-cell detail goes in the native `title` tooltip.
 */
export function Heatmap({
    rowLabels,
    colLabels,
    values,
    formatValue,
    cellTitle,
    scaleLabel,
}: {
    rowLabels: string[];
    colLabels: string[];
    /** `values[row][col]`, null where the bucket has no data at all. */
    values: (number | null)[][];
    formatValue: (value: number) => string;
    cellTitle: (row: number, col: number) => string;
    scaleLabel: string;
}) {
    const max = Math.max(
        1,
        ...values.flat().map((value) => (value === null ? 0 : value)),
    );

    return (
        <div>
            <div className="overflow-x-auto">
                <div style={{ minWidth: 640 }}>
                    <div
                        className="grid gap-0.5"
                        style={{
                            gridTemplateColumns: `2.5rem repeat(${colLabels.length}, minmax(0, 1fr))`,
                        }}
                    >
                        <div />
                        {colLabels.map((label, col) => (
                            <div
                                key={label}
                                className="pb-1 text-center text-[10px] text-gray-500 tabular-nums"
                            >
                                {col % 2 === 0 ? label : ""}
                            </div>
                        ))}

                        {rowLabels.map((rowLabel, row) => (
                            <div key={rowLabel} className="contents">
                                <div className="flex items-center pr-2 text-right text-[11px] text-gray-400">
                                    {rowLabel}
                                </div>
                                {colLabels.map((colLabel, col) => (
                                    <div
                                        key={`${rowLabel}-${colLabel}`}
                                        className="h-6 rounded-xs transition-opacity hover:opacity-80"
                                        title={cellTitle(row, col)}
                                        style={{
                                            background: heatFill(
                                                (values[row]?.[col] ?? 0) / max,
                                            ),
                                        }}
                                    />
                                ))}
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            <div className="mt-3 flex items-center gap-2 text-[11px] text-gray-500">
                <span>{scaleLabel}</span>
                <span className="tabular-nums">0</span>
                <span className="flex gap-px">
                    {SEQUENTIAL.map((step) => (
                        <span
                            key={step}
                            className="h-2 w-3"
                            style={{ background: step }}
                        />
                    ))}
                </span>
                <span className="tabular-nums">{formatValue(max)}</span>
            </div>
        </div>
    );
}

/* ------------------------------------------------------------------ shell */

export interface TableData {
    columns: string[];
    rows: ReactNode[][];
}

export function DataTable({
    data,
    maxHeight = "24rem",
}: {
    data: TableData;
    maxHeight?: string;
}) {
    return (
        <div className="overflow-auto" style={{ maxHeight }}>
            <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-gray-800 text-gray-400">
                    <tr className="border-b border-gray-700">
                        {data.columns.map((column, index) => (
                            <th
                                key={column}
                                className={`px-3 py-2 font-medium whitespace-nowrap ${
                                    index === 0 ? "" : "text-right"
                                }`}
                            >
                                {column}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {data.rows.length === 0 && (
                        <tr>
                            <td
                                colSpan={data.columns.length}
                                className="px-3 py-3 text-gray-500"
                            >
                                No rows in this range.
                            </td>
                        </tr>
                    )}
                    {data.rows.map((row, rowIndex) => (
                        <tr
                            key={rowIndex}
                            className="border-b border-gray-700/50 last:border-0"
                        >
                            {row.map((cell, cellIndex) => (
                                <td
                                    key={cellIndex}
                                    className={`px-3 py-1.5 whitespace-nowrap ${
                                        cellIndex === 0
                                            ? "text-gray-300"
                                            : "text-right tabular-nums text-gray-200"
                                    }`}
                                >
                                    {cell}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

/**
 * A chart in a card, with a toggle to read the same data as a table. The range
 * itself is chosen once, in the filter row above the page.
 */
export function ChartCard({
    title,
    subtitle,
    table,
    actions,
    children,
    className = "",
}: {
    title: string;
    subtitle?: ReactNode;
    table?: TableData;
    actions?: ReactNode;
    children?: ReactNode;
    className?: string;
}) {
    const [showTable, setShowTable] = useState(!children);

    return (
        <div
            className={`flex flex-col gap-3 rounded-lg bg-gray-800 p-4 shadow-xl ${className}`}
        >
            <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="flex flex-col gap-0.5">
                    <div className="font-semibold text-gray-200">{title}</div>
                    {subtitle && (
                        <div className="text-xs text-gray-500">{subtitle}</div>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {actions}
                    {table && children && (
                        <button
                            type="button"
                            onClick={() => setShowTable((open) => !open)}
                            className="rounded border border-gray-600 px-2 py-1 text-xs text-gray-400 hover:border-gray-500 hover:text-gray-200"
                        >
                            {showTable ? "Chart" : "Table"}
                        </button>
                    )}
                </div>
            </div>

            <div>{showTable && table ? <DataTable data={table} /> : children}</div>
        </div>
    );
}

export function StatTile({
    icon,
    label,
    value,
    sub,
    hero = false,
}: {
    icon?: ReactNode;
    label: string;
    value: string;
    sub?: ReactNode;
    hero?: boolean;
}) {
    return (
        <div className="flex flex-col gap-2 rounded-lg bg-gray-800 p-4 shadow-xl">
            <div className="flex items-center gap-2 text-sm text-gray-400">
                {icon && <span className="text-[#61dafb]">{icon}</span>}
                <span>{label}</span>
            </div>
            <div
                className={
                    hero
                        ? "text-5xl font-bold text-gray-100"
                        : "text-2xl font-bold text-gray-100"
                }
            >
                {value}
            </div>
            {sub && <div className="text-xs text-gray-500">{sub}</div>}
        </div>
    );
}

export function Section({
    id,
    title,
    description,
    children,
}: {
    id: string;
    title: string;
    description?: ReactNode;
    children: ReactNode;
}) {
    return (
        <section id={id} className="flex scroll-mt-4 flex-col gap-4">
            <div className="flex flex-col gap-1">
                <h2 className="text-lg font-semibold text-gray-100">{title}</h2>
                {description && (
                    <p className="max-w-3xl text-sm text-gray-500">
                        {description}
                    </p>
                )}
            </div>
            {children}
        </section>
    );
}
