import type { UseQueryResult } from "@tanstack/react-query";
import {
    formatNumber,
    type ClientBreakdown,
    type ClientsResponse,
} from "@/lib/analytics";
import { rangeLabel } from "@/lib/analytics-range";
import { ChartCard, HBarList, Section } from "@/components/viz";
import { SectionBody } from "@/components/analytics/shared";

const countryNames = new Intl.DisplayNames(undefined, { type: "region" });

const countryName = (code: string) => {
    try {
        return countryNames.of(code) ?? code;
    } catch {
        return code;
    }
};

const toItems = (rows: ClientBreakdown[], label = (value: string) => value) =>
    rows.map((row, index) => ({
        key: `${row.value}-${index}`,
        label: row.value.trim() ? label(row.value) : "(not reported)",
        value: row.player_days,
    }));

export function ClientsSection({
    query,
}: {
    query: UseQueryResult<ClientsResponse>;
}) {
    return (
        <Section
            id="clients"
            title="Clients & platforms"
            description="Reported by the client at login; the country comes from the request address. Every field is optional, so “(not reported)” means nothing was available. Counts are player-days: a player active on five days contributes five."
        >
            <SectionBody query={query} what="the client breakdown">
                {(data, dimmed) => {
                    const groups = [
                        {
                            title: "Poly+ client versions",
                            rows: data.client_versions,
                        },
                        {
                            title: "Minecraft versions",
                            rows: data.minecraft_versions,
                        },
                        { title: "Mod loaders", rows: data.loaders },
                        {
                            title: "Operating systems",
                            rows: data.operating_systems,
                        },
                        {
                            title: "Countries",
                            rows: data.countries ?? [],
                            label: countryName,
                        },
                    ];

                    return (
                        <div
                            className={`grid grid-cols-1 gap-4 xl:grid-cols-2 ${dimmed ? "opacity-50" : ""}`}
                        >
                            {groups.map((group) => {
                                const items = toItems(group.rows, group.label);
                                const total = group.rows.reduce(
                                    (sum, row) => sum + row.player_days,
                                    0,
                                );
                                return (
                                    <ChartCard
                                        key={group.title}
                                        title={group.title}
                                        subtitle={`${formatNumber(total)} player-days · ${rangeLabel(data.start, data.end)}`}
                                        table={{
                                            columns: [group.title, "Player-days"],
                                            rows: items.map((item) => [
                                                item.label,
                                                formatNumber(item.value),
                                            ]),
                                        }}
                                    >
                                        <HBarList
                                            items={items}
                                            formatValue={formatNumber}
                                        />
                                    </ChartCard>
                                );
                            })}
                        </div>
                    );
                }}
            </SectionBody>
        </Section>
    );
}
