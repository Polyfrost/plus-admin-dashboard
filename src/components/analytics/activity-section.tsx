import type { UseQueryResult } from "@tanstack/react-query";
import { Activity, Clock, Gauge, Users } from "lucide-react";
import {
    formatCompact,
    formatDayLabel,
    formatDuration,
    formatHourOfDay,
    formatHours,
    formatNumber,
    toHours,
    weekdayName,
    type ActivityResponse,
} from "@/lib/analytics";
import { MAX_HOURLY_SPAN_DAYS, rangeLabel } from "@/lib/analytics-range";
import {
    ChartCard,
    Heatmap,
    LineChart,
    SERIES_COLORS,
    Section,
    StatTile,
    type ChartSeries,
} from "@/components/viz";
import { SectionBody, TileGrid, seriesTable } from "@/components/analytics/shared";

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7];

export function ActivitySection({
    heatmap,
    hourly,
    hourlyAvailable,
}: {
    heatmap: UseQueryResult<ActivityResponse>;
    hourly: UseQueryResult<ActivityResponse>;
    hourlyAvailable: boolean;
}) {
    return (
        <Section
            id="activity"
            title="Activity by hour"
            description="When players are actually online. Every hour here is UTC, and heatmap counts are summed across the weeks in the range, so they are player-hours rather than distinct players."
        >
            <SectionBody query={heatmap} what="the activity heatmap">
                {(data, dimmed) => {
                    const cells = data.heatmap ?? [];
                    const lookup = new Map(
                        cells.map((cell) => [
                            `${cell.dow}:${cell.hour_of_day}`,
                            cell,
                        ]),
                    );
                    const values = WEEKDAYS.map((dow) =>
                        HOURS.map(
                            (hour) =>
                                lookup.get(`${dow}:${hour}`)?.active_players ??
                                null,
                        ),
                    );
                    const busiest = data.busiest;

                    return (
                        <div
                            className={`flex flex-col gap-4 ${dimmed ? "opacity-50" : ""}`}
                        >
                            <TileGrid>
                                <StatTile
                                    icon={<Gauge size={16} />}
                                    label="Busiest hour"
                                    value={
                                        busiest
                                            ? `${weekdayName(busiest.dow)} ${formatHourOfDay(busiest.hour_of_day)}`
                                            : "—"
                                    }
                                    sub={
                                        busiest
                                            ? `${formatNumber(busiest.active_players)} player-hours`
                                            : "no activity in this range"
                                    }
                                />
                                <StatTile
                                    icon={<Users size={16} />}
                                    label="Peak concurrent, busiest hour"
                                    value={
                                        busiest
                                            ? formatNumber(
                                                  busiest.peak_concurrent,
                                              )
                                            : "—"
                                    }
                                />
                                <StatTile
                                    icon={<Activity size={16} />}
                                    label="Sessions, busiest hour"
                                    value={
                                        busiest
                                            ? formatNumber(
                                                  busiest.sessions_started,
                                              )
                                            : "—"
                                    }
                                />
                                <StatTile
                                    icon={<Clock size={16} />}
                                    label="Playtime, busiest hour"
                                    value={
                                        busiest
                                            ? formatDuration(
                                                  busiest.playtime_seconds,
                                              )
                                            : "—"
                                    }
                                />
                            </TileGrid>

                            <ChartCard
                                title="Weekly rhythm"
                                subtitle={`Active players per UTC weekday and hour · ${rangeLabel(data.start, data.end)}`}
                                table={{
                                    columns: [
                                        "Weekday",
                                        "Hour",
                                        "Active players",
                                        "Sessions",
                                        "Peak concurrent",
                                        "Playtime",
                                    ],
                                    rows: cells.map((cell) => [
                                        weekdayName(cell.dow),
                                        formatHourOfDay(cell.hour_of_day),
                                        formatNumber(cell.active_players),
                                        formatNumber(cell.sessions_started),
                                        formatNumber(cell.peak_concurrent),
                                        formatDuration(cell.playtime_seconds),
                                    ]),
                                }}
                            >
                                <Heatmap
                                    rowLabels={WEEKDAYS.map((dow) =>
                                        weekdayName(dow).slice(0, 3),
                                    )}
                                    colLabels={HOURS.map((hour) =>
                                        String(hour).padStart(2, "0"),
                                    )}
                                    values={values}
                                    formatValue={formatCompact}
                                    scaleLabel="Active players"
                                    cellTitle={(row, col) => {
                                        const cell = lookup.get(
                                            `${row + 1}:${col}`,
                                        );
                                        return [
                                            `${weekdayName(row + 1)} ${formatHourOfDay(col)}`,
                                            `Active players: ${formatNumber(cell?.active_players ?? 0)}`,
                                            `Sessions started: ${formatNumber(cell?.sessions_started ?? 0)}`,
                                            `Peak concurrent: ${formatNumber(cell?.peak_concurrent ?? 0)}`,
                                            `Playtime: ${formatDuration(cell?.playtime_seconds ?? 0)}`,
                                        ].join("\n");
                                    }}
                                />
                            </ChartCard>
                        </div>
                    );
                }}
            </SectionBody>

            {!hourlyAvailable ? (
                <div className="rounded-lg bg-gray-800/60 px-4 py-4 text-sm text-gray-500">
                    The hourly series is capped at 1000 points server-side.
                    Choose a range of {MAX_HOURLY_SPAN_DAYS} days or fewer to
                    see it.
                </div>
            ) : (
                <SectionBody query={hourly} what="the hourly series">
                    {(data, dimmed) => {
                        const points = data.series ?? [];
                        const labels = points.map((point) => {
                            const date = new Date(point.hour_start);
                            return `${formatDayLabel(point.hour_start.slice(0, 10))} ${String(date.getUTCHours()).padStart(2, "0")}:00`;
                        });
                        const counts: ChartSeries[] = [
                            {
                                key: "active",
                                name: "Active players",
                                color: SERIES_COLORS[0],
                                values: points.map(
                                    (point) => point.active_players,
                                ),
                            },
                            {
                                key: "sessions",
                                name: "Sessions started",
                                color: SERIES_COLORS[1],
                                values: points.map(
                                    (point) => point.sessions_started,
                                ),
                            },
                            {
                                key: "peak",
                                name: "Peak concurrent",
                                color: SERIES_COLORS[2],
                                values: points.map(
                                    (point) => point.peak_concurrent,
                                ),
                            },
                        ];
                        const hourlyPlaytime: ChartSeries[] = [
                            {
                                key: "playtime",
                                name: "Playtime (hours)",
                                color: SERIES_COLORS[0],
                                values: points.map((point) =>
                                    toHours(point.playtime_seconds),
                                ),
                            },
                        ];

                        return (
                            <div
                                className={`grid grid-cols-1 gap-4 xl:grid-cols-2 ${dimmed ? "opacity-50" : ""}`}
                            >
                                <ChartCard
                                    title="Hourly activity"
                                    subtitle="One point per UTC hour"
                                    table={seriesTable("Hour", labels, counts)}
                                >
                                    <LineChart labels={labels} series={counts} />
                                </ChartCard>
                                <ChartCard
                                    title="Hourly playtime"
                                    table={seriesTable(
                                        "Hour",
                                        labels,
                                        hourlyPlaytime,
                                        formatHours,
                                    )}
                                >
                                    <LineChart
                                        labels={labels}
                                        series={hourlyPlaytime}
                                        area
                                        formatValue={formatHours}
                                        formatTick={formatHours}
                                    />
                                </ChartCard>
                            </div>
                        );
                    }}
                </SectionBody>
            )}
        </Section>
    );
}
