import type { UseQueryResult } from "@tanstack/react-query";
import {
    formatDayLabel,
    formatDuration,
    formatHours,
    formatNumber,
    toHours,
    type DailyPoint,
    type DailyResponse,
} from "@/lib/analytics";
import { rangeLabel } from "@/lib/analytics-range";
import {
    ChartCard,
    ColumnChart,
    LineChart,
    SERIES_COLORS,
    Section,
    type ChartSeries,
    type TableData,
} from "@/components/viz";
import { SectionBody, seriesTable } from "@/components/analytics/shared";

type DailyMetric = Exclude<keyof DailyPoint, "day">;

export function DailySection({
    query,
}: {
    query: UseQueryResult<DailyResponse>;
}) {
    return (
        <Section
            id="daily"
            title="Daily series"
            description="One precomputed row per UTC day. The most recent days can still move — anything after computed_through is provisional."
        >
            <SectionBody query={query} what="the daily series">
                {(data, dimmed) => {
                    const days = data.days;
                    const labels = days.map((day) => formatDayLabel(day.day));

                    const metric = (
                        key: DailyMetric,
                        name: string,
                        color: string,
                    ): ChartSeries => ({
                        key,
                        name,
                        color,
                        values: days.map((day) => day[key]),
                    });

                    const activeUsers = [
                        metric("dau", "DAU", SERIES_COLORS[0]),
                        metric("wau", "WAU", SERIES_COLORS[1]),
                        metric("mau", "MAU", SERIES_COLORS[2]),
                    ];
                    const composition = [
                        metric("returning_users", "Returning", SERIES_COLORS[0]),
                        metric("new_users", "New", SERIES_COLORS[1]),
                    ];
                    const registered = [
                        metric(
                            "total_users",
                            "Registered users",
                            SERIES_COLORS[0],
                        ),
                    ];
                    const playtime: ChartSeries[] = [
                        {
                            key: "playtime_hours",
                            name: "Playtime (hours)",
                            color: SERIES_COLORS[0],
                            values: days.map((day) =>
                                toHours(day.playtime_seconds),
                            ),
                        },
                    ];
                    const sessionCounts = [
                        metric("sessions", "Sessions", SERIES_COLORS[0]),
                    ];
                    const cosmetics = [
                        metric(
                            "cosmetics_acquired_paid",
                            "Paid",
                            SERIES_COLORS[0],
                        ),
                        metric(
                            "cosmetics_acquired_granted",
                            "Granted",
                            SERIES_COLORS[1],
                        ),
                    ];
                    const social = [
                        metric(
                            "friend_requests_sent",
                            "Requests sent",
                            SERIES_COLORS[0],
                        ),
                        metric(
                            "friend_requests_accepted",
                            "Requests accepted",
                            SERIES_COLORS[1],
                        ),
                        metric(
                            "friendships_created",
                            "Friendships created",
                            SERIES_COLORS[2],
                        ),
                        metric(
                            "blocks_created",
                            "Blocks created",
                            SERIES_COLORS[3],
                        ),
                    ];
                    const groups = [
                        metric("messages_sent", "Messages sent", SERIES_COLORS[0]),
                    ];
                    const playSessions = [
                        metric(
                            "game_sessions_created",
                            "Game sessions created",
                            SERIES_COLORS[0],
                        ),
                        metric(
                            "session_invites_sent",
                            "Invites sent",
                            SERIES_COLORS[1],
                        ),
                        metric(
                            "session_invites_accepted",
                            "Invites accepted",
                            SERIES_COLORS[2],
                        ),
                    ];
                    const linkHits = [
                        metric(
                            "tracked_link_hits",
                            "Tracked link hits",
                            SERIES_COLORS[0],
                        ),
                    ];

                    return (
                        <div
                            className={`flex flex-col gap-4 ${dimmed ? "opacity-50" : ""}`}
                        >
                            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-gray-500">
                                <span>{rangeLabel(data.start, data.end)}</span>
                                <span>
                                    Final through{" "}
                                    <span className="text-gray-300">
                                        {data.computed_through
                                            ? formatDayLabel(
                                                  data.computed_through,
                                              )
                                            : "—"}
                                    </span>
                                </span>
                                <span>{days.length} rows</span>
                            </div>

                            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                                <ChartCard
                                    title="Active users"
                                    subtitle="Daily, weekly and monthly actives"
                                    table={seriesTable("Day", labels, activeUsers)}
                                >
                                    <LineChart
                                        labels={labels}
                                        series={activeUsers}
                                    />
                                </ChartCard>

                                <ChartCard
                                    title="New vs returning"
                                    subtitle="How each day's active base splits"
                                    table={seriesTable(
                                        "Day",
                                        labels,
                                        composition,
                                    )}
                                >
                                    <ColumnChart
                                        labels={labels}
                                        series={composition}
                                        stacked
                                    />
                                </ChartCard>

                                <ChartCard
                                    title="Registered users"
                                    subtitle="Cumulative account total"
                                    table={seriesTable("Day", labels, registered)}
                                >
                                    <LineChart
                                        labels={labels}
                                        series={registered}
                                        area
                                    />
                                </ChartCard>

                                <ChartCard
                                    title="Playtime"
                                    subtitle="Hours played per day"
                                    table={seriesTable(
                                        "Day",
                                        labels,
                                        playtime,
                                        formatHours,
                                    )}
                                >
                                    <LineChart
                                        labels={labels}
                                        series={playtime}
                                        area
                                        formatValue={formatHours}
                                        formatTick={formatHours}
                                    />
                                </ChartCard>

                                <ChartCard
                                    title="Sessions started"
                                    table={seriesTable(
                                        "Day",
                                        labels,
                                        sessionCounts,
                                    )}
                                >
                                    <ColumnChart
                                        labels={labels}
                                        series={sessionCounts}
                                    />
                                </ChartCard>

                                <ChartCard
                                    title="Cosmetics acquired"
                                    subtitle="Paid purchases and grants"
                                    table={seriesTable("Day", labels, cosmetics)}
                                >
                                    <ColumnChart
                                        labels={labels}
                                        series={cosmetics}
                                        stacked
                                    />
                                </ChartCard>

                                <ChartCard
                                    title="Social graph"
                                    subtitle="Friend requests, friendships and blocks"
                                    table={seriesTable("Day", labels, social)}
                                >
                                    <LineChart labels={labels} series={social} />
                                </ChartCard>

                                <ChartCard
                                    title="Messages sent"
                                    subtitle="Group and direct messages"
                                    table={seriesTable("Day", labels, groups)}
                                >
                                    <LineChart
                                        labels={labels}
                                        series={groups}
                                        area
                                    />
                                </ChartCard>

                                <ChartCard
                                    title="Play sessions"
                                    subtitle="Created sessions and their invites"
                                    table={seriesTable(
                                        "Day",
                                        labels,
                                        playSessions,
                                    )}
                                >
                                    <LineChart
                                        labels={labels}
                                        series={playSessions}
                                    />
                                </ChartCard>

                                <ChartCard
                                    title="Tracked link hits"
                                    subtitle="Visits counted on /go/{slug}"
                                    table={seriesTable("Day", labels, linkHits)}
                                >
                                    <ColumnChart
                                        labels={labels}
                                        series={linkHits}
                                    />
                                </ChartCard>
                            </div>

                            <ChartCard
                                title="Every daily field"
                                subtitle="All 23 measures the rollup stores, per day"
                                table={dailyTable(days)}
                            />
                        </div>
                    );
                }}
            </SectionBody>
        </Section>
    );
}

function dailyTable(days: DailyPoint[]): TableData {
    const columns: [string, (day: DailyPoint) => string][] = [
        ["DAU", (day) => formatNumber(day.dau)],
        ["WAU", (day) => formatNumber(day.wau)],
        ["MAU", (day) => formatNumber(day.mau)],
        ["New", (day) => formatNumber(day.new_users)],
        ["Returning", (day) => formatNumber(day.returning_users)],
        ["Total users", (day) => formatNumber(day.total_users)],
        ["Playtime", (day) => formatDuration(day.playtime_seconds)],
        ["Sessions", (day) => formatNumber(day.sessions)],
        ["Cosmetics", (day) => formatNumber(day.cosmetics_acquired)],
        ["… paid", (day) => formatNumber(day.cosmetics_acquired_paid)],
        ["… granted", (day) => formatNumber(day.cosmetics_acquired_granted)],
        ["Transactions", (day) => formatNumber(day.transactions_completed)],
        ["… refunded", (day) => formatNumber(day.transactions_refunded)],
        ["Gifts", (day) => formatNumber(day.gift_transactions)],
        ["Requests sent", (day) => formatNumber(day.friend_requests_sent)],
        [
            "Requests accepted",
            (day) => formatNumber(day.friend_requests_accepted),
        ],
        ["Friendships", (day) => formatNumber(day.friendships_created)],
        ["Blocks", (day) => formatNumber(day.blocks_created)],
        ["Messages", (day) => formatNumber(day.messages_sent)],
        ["Game sessions", (day) => formatNumber(day.game_sessions_created)],
        ["Invites sent", (day) => formatNumber(day.session_invites_sent)],
        [
            "Invites accepted",
            (day) => formatNumber(day.session_invites_accepted),
        ],
        ["Link hits", (day) => formatNumber(day.tracked_link_hits)],
    ];

    return {
        columns: ["Day", ...columns.map(([label]) => label)],
        rows: days.map((day) => [
            formatDayLabel(day.day),
            ...columns.map(([, read]) => read(day)),
        ]),
    };
}
