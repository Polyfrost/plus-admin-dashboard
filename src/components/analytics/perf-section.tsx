import type { UseQueryResult } from "@tanstack/react-query";
import { useState } from "react";
import { Download } from "lucide-react";
import { apiFetch } from "@/lib/session";
import {
    formatBytes,
    formatDateTime,
    formatDayLabel,
    formatNumber,
    type PerfDailyResponse,
    type PerfProfile,
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
    env,
    daily,
    regressions,
    profiles,
}: {
    env: string;
    daily: UseQueryResult<PerfDailyResponse>;
    regressions: UseQueryResult<PerfResponse>;
    profiles: UseQueryResult<PerfProfile[]>;
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
                <SectionBody query={profiles} what="spark profiles">
                    {(data, dimmed) => (
                        <ProfileTable env={env} data={data} dimmed={dimmed} />
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

function ProfileTable({
    env,
    data,
    dimmed,
}: {
    env: string;
    data: PerfProfile[];
    dimmed: boolean;
}) {
    return (
        <ExportScopeProvider scope="latest-50">
            <div className={`flex flex-col gap-2 ${dimmed ? "opacity-50" : ""}`}>
                <ChartCard
                    title="Spark profiles"
                    subtitle="Latest 50 uploads, newest first."
                    tableMaxHeight="28rem"
                    table={{
                        columns: [
                            "Uploaded",
                            "Minecraft",
                            "PolyPlus",
                            "Loader",
                            "Pack",
                            "Size",
                            "",
                        ],
                        rows: data.map((row) => [
                            formatDateTime(row.created_at),
                            row.minecraft_version,
                            row.client_version,
                            row.loader,
                            <span className="font-mono">{row.pack_hash.slice(0, 8)}</span>,
                            formatBytes(row.size_bytes),
                            <ProfileDownload
                                key={row.id}
                                env={env}
                                profile={row}
                                stale={dimmed}
                            />,
                        ]),
                    }}
                />
                <p className="px-1 text-xs text-gray-500">
                    Open downloaded files at{" "}
                    <a
                        href="https://spark.lucko.me"
                        target="_blank"
                        rel="noreferrer"
                        className="underline hover:text-gray-300"
                    >
                        spark.lucko.me
                    </a>{" "}
                    by dragging them onto the page.
                </p>
            </div>
        </ExportScopeProvider>
    );
}

/** Matches the file to its table row; the ID suffix keeps names unique. */
function profileFilename(profile: PerfProfile): string {
    const name = [
        profile.created_at.slice(0, 19),
        profile.minecraft_version,
        profile.loader,
        profile.id.slice(-8),
    ].join("_");
    return `${name.replace(/[^\w.-]+/g, "-")}.sparkprofile`;
}

function ProfileDownload({
    env,
    profile,
    stale,
}: {
    env: string;
    profile: PerfProfile;
    /** Rows may still belong to the previous env while a refetch runs. */
    stale: boolean;
}) {
    const [state, setState] = useState<"idle" | "busy" | "failed">("idle");

    const download = async () => {
        setState("busy");
        try {
            const res = await apiFetch(
                { env },
                `/v1/analytics/perf/profiles/${encodeURIComponent(profile.id)}`,
            );
            if (!res.ok) throw new Error(String(res.status));
            const url = URL.createObjectURL(await res.blob());
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = profileFilename(profile);
            anchor.click();
            setTimeout(() => URL.revokeObjectURL(url), 0);
            setState("idle");
        } catch {
            setState("failed");
        }
    };

    return (
        <button
            type="button"
            onClick={download}
            disabled={stale || state === "busy"}
            className="inline-flex items-center gap-1 rounded border border-gray-600 px-2 py-1 text-xs text-gray-400 hover:border-gray-500 hover:text-gray-200 disabled:cursor-wait disabled:opacity-40"
        >
            <Download size={12} />
            {state === "failed" ? "Retry" : "Download"}
        </button>
    );
}
