import type { UseQueryResult } from "@tanstack/react-query";
import {
    formatNumber,
    type ClientBreakdown,
    type ClientsResponse,
} from "@/lib/analytics";
import { rangeLabel } from "@/lib/analytics-range";
import { ChartCard, HBarList, Section } from "@/components/viz";
import { SectionBody } from "@/components/analytics/shared";

const toItems = (rows: ClientBreakdown[]) =>
    rows.map((row, index) => ({
        key: `${row.value}-${index}`,
        label: row.value.trim() ? row.value : "(not reported)",
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
            description="Reported by the client at login. Every field is optional, so “(not reported)” means the client sent nothing. Counts are player-days: a player active on five days contributes five."
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
                    ];

                    return (
                        <div
                            className={`grid grid-cols-1 gap-4 xl:grid-cols-2 ${dimmed ? "opacity-50" : ""}`}
                        >
                            {groups.map((group) => {
                                const total = group.rows.reduce(
                                    (sum, row) => sum + row.player_days,
                                    0,
                                );
                                return (
                                    <ChartCard
                                        key={group.title}
                                        title={group.title}
                                        subtitle={`${formatNumber(total)} player-days · ${rangeLabel(data.start, data.end)}`}
                                    >
                                        <HBarList
                                            items={toItems(group.rows)}
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
