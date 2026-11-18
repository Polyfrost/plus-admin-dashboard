import type { UseQueryResult } from "@tanstack/react-query";
import { Link2, UserCheck, UserPlus } from "lucide-react";
import {
    formatDayLabel,
    formatNumber,
    percent,
    type LinkedAccountsResponse,
} from "@/lib/analytics";
import { asOfLabel, rangeLabel } from "@/lib/analytics-range";
import {
    ChartCard,
    ColumnChart,
    HBarList,
    LineChart,
    SERIES_COLORS,
    Section,
    StatTile,
} from "@/components/viz";
import {
    SectionBody,
    TileGrid,
    seriesTable,
} from "@/components/analytics/shared";

const PROVIDER_LABELS: Record<string, string> = { discord: "Discord" };

export function LinkedAccountsSection({
    query,
}: {
    query: UseQueryResult<LinkedAccountsResponse>;
}) {
    return (
        <Section
            id="linked-accounts"
            title="Linked accounts"
            description="External accounts players have linked. Unlinking deletes the link, so every figure only counts links still held today."
        >
            <SectionBody query={query} what="linked accounts">
                {(data, dimmed) => {
                    const labels = data.days.map((day) =>
                        formatDayLabel(day.day),
                    );
                    const held = [
                        {
                            key: "total_links",
                            name: "Linked accounts",
                            color: SERIES_COLORS[0],
                            values: data.days.map((day) => day.total_links),
                        },
                    ];
                    const made = [
                        {
                            key: "new_links",
                            name: "New links",
                            color: SERIES_COLORS[1],
                            values: data.days.map((day) => day.new_links),
                        },
                    ];
                    const providers = data.providers.map((provider) => ({
                        key: provider.provider,
                        label:
                            PROVIDER_LABELS[provider.provider] ??
                            provider.provider,
                        value: provider.links,
                        newLinks: provider.new_links,
                        share: percent(provider.links, data.total_links),
                    }));

                    return (
                        <div
                            className={`flex flex-col gap-4 ${dimmed ? "opacity-50" : ""}`}
                        >
                            <TileGrid>
                                <StatTile
                                    icon={<Link2 size={16} />}
                                    label="Linked accounts"
                                    value={formatNumber(data.total_links)}
                                    sub={asOfLabel(data.end)}
                                />
                                <StatTile
                                    icon={<UserCheck size={16} />}
                                    label="Users with a link"
                                    value={formatNumber(data.linked_users)}
                                    sub={asOfLabel(data.end)}
                                />
                                <StatTile
                                    icon={<UserPlus size={16} />}
                                    label="New links"
                                    value={formatNumber(data.new_links)}
                                    sub="Inside the range"
                                />
                            </TileGrid>

                            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                                <ChartCard
                                    title="Linked accounts"
                                    subtitle="Held at the end of each day"
                                    table={seriesTable("Day", labels, held)}
                                >
                                    <LineChart
                                        labels={labels}
                                        series={held}
                                        area
                                    />
                                </ChartCard>

                                <ChartCard
                                    title="New links"
                                    subtitle="Links made per day"
                                    table={seriesTable("Day", labels, made)}
                                >
                                    <ColumnChart
                                        labels={labels}
                                        series={made}
                                    />
                                </ChartCard>
                            </div>

                            <ChartCard
                                title="Links by provider"
                                subtitle={`${formatNumber(data.total_links)} links · ${rangeLabel(data.start, data.end)}`}
                                table={{
                                    columns: [
                                        "Provider",
                                        "Links",
                                        "Share",
                                        "New",
                                    ],
                                    rows: providers.map((provider) => [
                                        provider.label,
                                        formatNumber(provider.value),
                                        provider.share,
                                        formatNumber(provider.newLinks),
                                    ]),
                                }}
                            >
                                <HBarList
                                    items={providers.map((provider) => ({
                                        ...provider,
                                        sub: `(${provider.share})`,
                                    }))}
                                    formatValue={formatNumber}
                                />
                            </ChartCard>
                        </div>
                    );
                }}
            </SectionBody>
        </Section>
    );
}
