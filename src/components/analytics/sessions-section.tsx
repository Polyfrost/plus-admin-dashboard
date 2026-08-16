import type { UseQueryResult } from "@tanstack/react-query";
import { Activity, Hourglass, Users } from "lucide-react";
import {
    formatBucketLabel,
    formatDateTime,
    formatDuration,
    formatNumber,
    percent,
    type SessionsResponse,
} from "@/lib/analytics";
import { rangeLabel } from "@/lib/analytics-range";
import {
    ChartCard,
    ColumnChart,
    SERIES_COLORS,
    Section,
    StatTile,
    type ChartSeries,
} from "@/components/viz";
import { SectionBody, TileGrid } from "@/components/analytics/shared";

export function SessionsSection({
    query,
}: {
    query: UseQueryResult<SessionsResponse>;
}) {
    return (
        <Section
            id="sessions"
            title="Session length & concurrency"
            description="Lengths are stored in buckets, so the percentiles are interpolated inside the bucket that contains them rather than exact. Sessions count towards the day they started on."
        >
            <SectionBody query={query} what="sessions">
                {(data, dimmed) => {
                    const distribution = data.distribution;
                    const labels = distribution.map(formatBucketLabel);
                    const series: ChartSeries[] = [
                        {
                            key: "sessions",
                            name: "Sessions",
                            color: SERIES_COLORS[0],
                            values: distribution.map(
                                (bucket) => bucket.sessions,
                            ),
                        },
                    ];
                    const percentile = (value?: number | null) =>
                        value === null || value === undefined
                            ? "—"
                            : formatDuration(value);

                    return (
                        <div
                            className={`flex flex-col gap-4 ${dimmed ? "opacity-50" : ""}`}
                        >
                            <TileGrid>
                                <StatTile
                                    icon={<Activity size={16} />}
                                    label="Sessions"
                                    value={formatNumber(data.sessions)}
                                    sub={rangeLabel(data.start, data.end)}
                                />
                                <StatTile
                                    icon={<Hourglass size={16} />}
                                    label="Median session (p50)"
                                    value={percentile(
                                        data.percentiles.p50_seconds,
                                    )}
                                />
                                <StatTile
                                    icon={<Hourglass size={16} />}
                                    label="p90 session"
                                    value={percentile(
                                        data.percentiles.p90_seconds,
                                    )}
                                />
                                <StatTile
                                    icon={<Hourglass size={16} />}
                                    label="p99 session"
                                    value={percentile(
                                        data.percentiles.p99_seconds,
                                    )}
                                />
                                <StatTile
                                    icon={<Users size={16} />}
                                    label="Peak concurrent players"
                                    value={
                                        data.peak_concurrent
                                            ? formatNumber(
                                                  data.peak_concurrent.players,
                                              )
                                            : "—"
                                    }
                                    sub={
                                        data.peak_concurrent
                                            ? formatDateTime(
                                                  data.peak_concurrent
                                                      .hour_start,
                                              )
                                            : "no sessions in this range"
                                    }
                                />
                            </TileGrid>

                            <ChartCard
                                title="Session length distribution"
                                subtitle="Sessions per length bucket"
                                table={{
                                    columns: ["Bucket", "Sessions", "Share"],
                                    rows: distribution.map((bucket) => [
                                        formatBucketLabel(bucket),
                                        formatNumber(bucket.sessions),
                                        percent(bucket.sessions, data.sessions),
                                    ]),
                                }}
                            >
                                <ColumnChart labels={labels} series={series} />
                            </ChartCard>
                        </div>
                    );
                }}
            </SectionBody>
        </Section>
    );
}
