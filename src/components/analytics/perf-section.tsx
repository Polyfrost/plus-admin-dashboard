import type { UseQueryResult } from "@tanstack/react-query";
import {
    formatDateTime,
    formatDayLabel,
    formatNumber,
    type PerfDailyResponse,
    type PerfResponse,
} from "@/lib/analytics";
import { rangeLabel } from "@/lib/analytics-range";
import {
    ChartCard,
    LineChart,
    SERIES_COLORS,
    ExportScopeProvider,
    Section,
    type ChartSeries,
} from "@/components/viz";
import { SectionBody, seriesTable } from "@/components/analytics/shared";

const formatFps = (value: number) => value.toFixed(0);
const formatRatio = (ratio: number) => `${((ratio - 1) * 100).toFixed(1)}%`;

export function PerfSection({
    daily,
    regressions,
}: {
    daily: UseQueryResult<PerfDailyResponse>;
    regressions: UseQueryResult<PerfResponse>;
}) {
    return (
        <Section
            id="performance"
            title="Performance"
            description="In-world FPS reported by PolyPlus every five minutes of play. Each player counts once per day (their own median), then the median across players is taken. Vsync and capped-FPS reports are left out."
        >
            <div className="flex flex-col gap-4">
                <SectionBody query={daily} what="daily FPS">
                    {(data, dimmed) => <DailyCharts data={data} dimmed={dimmed} />}
                </SectionBody>
                <SectionBody query={regressions} what="FPS regressions">
                    {(data, dimmed) => (
                        <RegressionTable data={data} dimmed={dimmed} />
                    )}
                </SectionBody>
            </div>
        </Section>
    );
}

function DailyCharts({
    data,
    dimmed,
}: {
    data: PerfDailyResponse;
    dimmed: boolean;
}) {
    const dayKeys = [...new Set(data.days.map((row) => row.day))].sort();
    const labels = dayKeys.map(formatDayLabel);
    const index = new Map(dayKeys.map((day, i) => [day, i]));

    const players = new Map<string, number>();
    for (const row of data.days) {
        players.set(
            row.minecraft_version,
            (players.get(row.minecraft_version) ?? 0) + row.players,
        );
    }
    const versions = [...players.keys()]
        .filter((version) => version !== data.all_versions)
        .sort((a, b) => players.get(b)! - players.get(a)!);

    const values = (
        version: string,
        pick: (row: PerfDailyResponse["days"][number]) => number,
    ) => {
        const out: (number | null)[] = dayKeys.map(() => null);
        for (const row of data.days) {
            if (row.minecraft_version === version) out[index.get(row.day)!] = pick(row);
        }
        return out;
    };

    const byVersion: ChartSeries[] = [data.all_versions, ...versions].map(
        (version, i) => ({
            key: version,
            name: version === data.all_versions ? "All versions" : version,
            color: SERIES_COLORS[i % SERIES_COLORS.length],
            values: values(version, (row) => row.median_fps),
        }),
    );
    const charted = byVersion.slice(0, SERIES_COLORS.length);
    const hidden = byVersion.length - charted.length;
    const lows: ChartSeries[] = [
        {
            key: "median",
            name: "Median",
            color: SERIES_COLORS[0],
            values: values(data.all_versions, (row) => row.median_fps),
        },
        {
            key: "low1",
            name: "1% low",
            color: SERIES_COLORS[1],
            values: values(data.all_versions, (row) => row.low1_fps),
        },
        {
            key: "low01",
            name: "0.1% low",
            color: SERIES_COLORS[2],
            values: values(data.all_versions, (row) => row.low01_fps),
        },
    ];
    const reporting: ChartSeries[] = [
        {
            key: "players",
            name: "Players",
            color: SERIES_COLORS[0],
            values: values(data.all_versions, (row) => row.players),
        },
    ];

    const releaseNames = new Map<string, string[]>();
    for (const release of data.releases) {
        if (!index.has(release.day)) continue;
        const label = formatDayLabel(release.day);
        releaseNames.set(label, [
            ...(releaseNames.get(label) ?? []),
            release.client_version,
        ]);
    }
    const markers = [...releaseNames].map(([label, names]) => ({
        label,
        name: names.join(", "),
    }));

    return (
        <div className={`flex flex-col gap-4 ${dimmed ? "opacity-50" : ""}`}>
            <ChartCard
                title="Median FPS by Minecraft version"
                subtitle={`Dashed lines mark the first day each PolyPlus version was reported${hidden > 0 ? ` · ${hidden} quieter versions only in table` : ""} · ${rangeLabel(data.start, data.end)}`}
                table={seriesTable("Day", labels, byVersion, formatFps)}
            >
                <LineChart
                    labels={labels}
                    series={charted}
                    markers={markers}
                    height={300}
                    formatValue={formatFps}
                />
            </ChartCard>
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <ChartCard
                    title="Median and lows"
                    subtitle="All versions"
                    table={seriesTable("Day", labels, lows, formatFps)}
                >
                    <LineChart
                        labels={labels}
                        series={lows}
                        markers={markers}
                        formatValue={formatFps}
                    />
                </ChartCard>
                <ChartCard
                    title="Reporting players"
                    subtitle="All versions"
                    table={seriesTable("Day", labels, reporting)}
                >
                    <LineChart labels={labels} series={reporting} area />
                </ChartCard>
            </div>
        </div>
    );
}

function RegressionTable({
    data,
    dimmed,
}: {
    data: PerfResponse;
    dimmed: boolean;
}) {
    return (
        <ExportScopeProvider scope="last-30-days">
            <ChartCard
                className={dimmed ? "opacity-50" : ""}
                title="Detected regressions"
                subtitle="Mod updates after which the same players on the same setup lost FPS. Solo counts transitions where that mod was the only change. Based on the 30 days of reports before Updated; rows drop off 30 days after their last update, independent of the range."
                tableMaxHeight="28rem"
                table={{
                    columns: [
                        "Mod",
                        "Change",
                        "Minecraft",
                        "Metric",
                        "Pairs",
                        "FPS change",
                        "Solo pairs",
                        "Solo change",
                        "Updated",
                    ],
                    rows: data.regressions.map((row) => [
                        row.mod_id,
                        `${row.from_version} → ${row.to_version}`,
                        `${row.minecraft_version} ${row.loader}`,
                        row.metric,
                        formatNumber(row.pairs),
                        formatRatio(row.ratio),
                        formatNumber(row.solo_pairs),
                        row.solo_ratio === null ? "—" : formatRatio(row.solo_ratio),
                        formatDateTime(row.updated_at),
                    ]),
                }}
            />
        </ExportScopeProvider>
    );
}
