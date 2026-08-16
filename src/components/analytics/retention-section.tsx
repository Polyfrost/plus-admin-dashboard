import type { UseQueryResult } from "@tanstack/react-query";
import { TrendingUp, UserPlus } from "lucide-react";
import {
    formatDayLabel,
    formatNumber,
    formatRate,
    type RetentionResponse,
} from "@/lib/analytics";
import { rangeLabel } from "@/lib/analytics-range";
import {
    ChartCard,
    LineChart,
    SERIES_COLORS,
    Section,
    StatTile,
    heatFill,
    heatInk,
} from "@/components/viz";
import { SectionBody, TileGrid, seriesTable } from "@/components/analytics/shared";

const RETENTION_OFFSETS = [
    0, 1, 2, 3, 4, 5, 6, 7, 14, 21, 28, 30, 60, 90, 180, 365,
] as const;

/** The offsets the headline tiles and the curve chart summarise. */
const HEADLINE_OFFSETS = [1, 7, 30] as const;

export function RetentionSection({
    query,
}: {
    query: UseQueryResult<RetentionResponse>;
}) {
    return (
        <Section
            id="retention"
            title="Signup cohort retention"
            description="For every signup day, how many of that day's accounts played again N days later. A blank cell means the offset has not elapsed yet for that cohort — not that nobody came back."
        >
            <SectionBody query={query} what="retention">
                {(data, dimmed) => {
                    const cohorts = data.cohorts;
                    const labels = cohorts.map((cohort) =>
                        formatDayLabel(cohort.cohort_day),
                    );

                    const curve = HEADLINE_OFFSETS.map((offset, index) => ({
                        key: `d${offset}`,
                        name: `Day ${offset}`,
                        color: SERIES_COLORS[index],
                        values: cohorts.map((cohort) => {
                            const rate = cohort.offsets.find(
                                (point) => point.day_offset === offset,
                            )?.rate;
                            return rate === undefined ? null : rate * 100;
                        }),
                    }));

                    const averages = HEADLINE_OFFSETS.map((offset) => {
                        let retained = 0;
                        let size = 0;
                        for (const cohort of cohorts) {
                            const point = cohort.offsets.find(
                                (one) => one.day_offset === offset,
                            );
                            if (!point) continue;
                            retained += point.retained;
                            size += cohort.cohort_size;
                        }
                        return {
                            offset,
                            rate: size > 0 ? retained / size : null,
                            size,
                        };
                    });

                    const totalCohort = cohorts.reduce(
                        (sum, cohort) => sum + cohort.cohort_size,
                        0,
                    );

                    return (
                        <div
                            className={`flex flex-col gap-4 ${dimmed ? "opacity-50" : ""}`}
                        >
                            <TileGrid>
                                <StatTile
                                    icon={<UserPlus size={16} />}
                                    label="Accounts in these cohorts"
                                    value={formatNumber(totalCohort)}
                                    sub={rangeLabel(data.start, data.end)}
                                />
                                {averages.map((average) => (
                                    <StatTile
                                        key={average.offset}
                                        icon={<TrendingUp size={16} />}
                                        label={`Day ${average.offset} retention`}
                                        value={
                                            average.rate === null
                                                ? "—"
                                                : formatRate(average.rate)
                                        }
                                        sub={
                                            average.size > 0
                                                ? `over ${formatNumber(average.size)} accounts with the offset elapsed`
                                                : "no cohort has reached this offset"
                                        }
                                    />
                                ))}
                            </TileGrid>

                            <ChartCard
                                title="Retention by cohort"
                                subtitle="Share of each signup day that came back"
                                table={seriesTable(
                                    "Cohort",
                                    labels,
                                    curve,
                                    (value) => `${value.toFixed(1)}%`,
                                )}
                            >
                                <LineChart
                                    labels={labels}
                                    series={curve}
                                    formatValue={(value) =>
                                        `${value.toFixed(1)}%`
                                    }
                                    formatTick={(value) => `${value}%`}
                                />
                            </ChartCard>

                            <CohortGrid cohorts={cohorts} />
                        </div>
                    );
                }}
            </SectionBody>
        </Section>
    );
}

/**
 * A table rather than a chart because the blank cells carry meaning: an offset
 * that has not elapsed yet is not a zero.
 */
function CohortGrid({
    cohorts,
}: {
    cohorts: RetentionResponse["cohorts"];
}) {
    return (
        <div className="flex flex-col gap-3 rounded-lg bg-gray-800 p-4 shadow-xl">
            <div className="font-semibold text-gray-200">Cohort grid</div>
            <div className="max-h-128 overflow-auto">
                <table className="w-full text-left text-sm">
                    <thead className="sticky top-0 bg-gray-800 text-gray-400">
                        <tr className="border-b border-gray-700">
                            <th className="px-3 py-2 font-medium whitespace-nowrap">
                                Cohort
                            </th>
                            <th className="px-3 py-2 text-right font-medium">
                                Size
                            </th>
                            {RETENTION_OFFSETS.map((offset) => (
                                <th
                                    key={offset}
                                    className="px-2 py-2 text-center font-medium tabular-nums"
                                >
                                    D{offset}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {cohorts.length === 0 && (
                            <tr>
                                <td
                                    colSpan={RETENTION_OFFSETS.length + 2}
                                    className="px-3 py-3 text-gray-500"
                                >
                                    No cohorts in this range.
                                </td>
                            </tr>
                        )}
                        {cohorts.map((cohort) => (
                            <tr
                                key={cohort.cohort_day}
                                className="border-b border-gray-700/50 last:border-0"
                            >
                                <td className="px-3 py-1.5 whitespace-nowrap text-gray-300">
                                    {formatDayLabel(cohort.cohort_day)}
                                </td>
                                <td className="px-3 py-1.5 text-right tabular-nums text-gray-200">
                                    {formatNumber(cohort.cohort_size)}
                                </td>
                                {RETENTION_OFFSETS.map((offset) => {
                                    const point = cohort.offsets.find(
                                        (one) => one.day_offset === offset,
                                    );
                                    if (!point) {
                                        return (
                                            <td
                                                key={offset}
                                                className="px-2 py-1.5 text-center text-gray-600"
                                                title="Not knowable yet"
                                            >
                                                —
                                            </td>
                                        );
                                    }
                                    return (
                                        <td key={offset} className="px-1 py-1">
                                            <div
                                                className="rounded-[3px] px-1.5 py-1 text-center text-xs tabular-nums"
                                                style={{
                                                    background: heatFill(
                                                        point.rate,
                                                    ),
                                                    color: heatInk(point.rate),
                                                }}
                                                title={`${formatNumber(point.retained)} of ${formatNumber(cohort.cohort_size)} returned`}
                                            >
                                                {formatRate(point.rate, 0)}
                                            </div>
                                        </td>
                                    );
                                })}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
