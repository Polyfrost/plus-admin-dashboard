import type { UseQueryResult } from "@tanstack/react-query";
import { formatNumber, percent, type ModsResponse } from "@/lib/analytics";
import { rangeLabel } from "@/lib/analytics-range";
import { ChartCard, HBarList, Section } from "@/components/viz";
import { SectionBody } from "@/components/analytics/shared";

export function ModsSection({ query }: { query: UseQueryResult<ModsResponse> }) {
    return (
        <Section
            id="mods"
            title="Installed mods"
            description="Clients report their top-level mods once per launch, and each report replaces the last. A player counts once, holding their latest report, if it falls in the range."
        >
            <SectionBody query={query} what="mod usage">
                {(data, dimmed) => {
                    const items = data.mods.map((mod) => ({
                        key: mod.mod_id,
                        label: mod.mod_id,
                        value: mod.players,
                        share: percent(mod.players, data.reporting_players),
                    }));

                    return (
                        <ChartCard
                            className={dimmed ? "opacity-50" : ""}
                            title="Mods by players"
                            subtitle={`${formatNumber(data.reporting_players)} reporting players · ${formatNumber(data.mods.length)} mods · ${rangeLabel(data.start, data.end)}`}
                            tableMaxHeight="28rem"
                            table={{
                                columns: ["Mod", "Players", "Share"],
                                rows: items.map((item) => [
                                    item.label,
                                    formatNumber(item.value),
                                    item.share,
                                ]),
                            }}
                        >
                            <HBarList
                                items={items.map((item) => ({
                                    ...item,
                                    sub: `(${item.share})`,
                                }))}
                                formatValue={formatNumber}
                            />
                        </ChartCard>
                    );
                }}
            </SectionBody>
        </Section>
    );
}
