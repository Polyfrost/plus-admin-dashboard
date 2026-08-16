import type { UseQueryResult } from "@tanstack/react-query";
import { Eye, Layers, ShoppingCart, TrendingUp } from "lucide-react";
import {
    formatNumber,
    formatRate,
    type CatalogEntry,
    type CatalogResponse,
    type CatalogSort,
} from "@/lib/analytics";
import { rangeLabel } from "@/lib/analytics-range";
import {
    ChartCard,
    DataTable,
    HBarList,
    Section,
    StatTile,
} from "@/components/viz";
import { SectionBody, TileGrid } from "@/components/analytics/shared";

const CATALOG_SORTS: { id: CatalogSort; label: string }[] = [
    { id: "views", label: "Views" },
    { id: "acquisitions", label: "Acquisitions" },
    { id: "conversion", label: "Conversion" },
];

const entryName = (entry: CatalogEntry) =>
    entry.name?.trim() ? entry.name : `Cosmetic #${entry.cosmetic_id}`;

const optional = (
    value: number | null | undefined,
    format: (value: number) => string,
) => (value === null || value === undefined ? "—" : format(value));

export function CatalogSection({
    query,
    sort,
    setSort,
    limit,
    setLimit,
}: {
    query: UseQueryResult<CatalogResponse>;
    sort: CatalogSort;
    setSort: (sort: CatalogSort) => void;
    limit: number;
    setLimit: (limit: number) => void;
}) {
    const controls = (
        <div className="flex items-center gap-2">
            <select
                value={sort}
                onChange={(event) => setSort(event.target.value as CatalogSort)}
                className="rounded border border-gray-600 bg-gray-700 px-2 py-1 text-sm text-gray-200"
            >
                {CATALOG_SORTS.map((option) => (
                    <option key={option.id} value={option.id}>
                        Sort by {option.label.toLowerCase()}
                    </option>
                ))}
            </select>
            <select
                value={limit}
                onChange={(event) => setLimit(Number(event.target.value))}
                className="rounded border border-gray-600 bg-gray-700 px-2 py-1 text-sm text-gray-200"
            >
                {[10, 25, 50, 100, 250].map((option) => (
                    <option key={option} value={option}>
                        Top {option}
                    </option>
                ))}
            </select>
        </div>
    );

    return (
        <Section
            id="catalog"
            title="Cosmetic performance"
            description="Views are only counted when a cosmetic is opened, so one seen in a list but never opened does not register. Conversion can exceed 100% for cosmetics acquired in a bundle without being opened first."
        >
            <SectionBody query={query} what="the catalog">
                {(data, dimmed) => {
                    const entries = data.cosmetics;

                    const metricOf = (entry: CatalogEntry) =>
                        sort === "views"
                            ? entry.views
                            : sort === "acquisitions"
                              ? entry.acquisitions
                              : (entry.conversion ?? 0) * 100;
                    const metricLabel =
                        sort === "conversion"
                            ? "conversion"
                            : sort === "acquisitions"
                              ? "acquisitions"
                              : "views";

                    const totals = entries.reduce(
                        (sum, entry) => ({
                            views: sum.views + entry.views,
                            acquisitions: sum.acquisitions + entry.acquisitions,
                            paid: sum.paid + entry.acquisitions_paid,
                            granted: sum.granted + entry.acquisitions_granted,
                        }),
                        { views: 0, acquisitions: 0, paid: 0, granted: 0 },
                    );

                    return (
                        <div
                            className={`flex flex-col gap-4 ${dimmed ? "opacity-50" : ""}`}
                        >
                            <TileGrid>
                                <StatTile
                                    icon={<Layers size={16} />}
                                    label="Cosmetics listed"
                                    value={formatNumber(entries.length)}
                                    sub={rangeLabel(data.start, data.end)}
                                />
                                <StatTile
                                    icon={<Eye size={16} />}
                                    label="Views"
                                    value={formatNumber(totals.views)}
                                    sub="Across the listed cosmetics"
                                />
                                <StatTile
                                    icon={<ShoppingCart size={16} />}
                                    label="Acquisitions"
                                    value={formatNumber(totals.acquisitions)}
                                    sub={`${formatNumber(totals.paid)} paid · ${formatNumber(totals.granted)} granted`}
                                />
                                <StatTile
                                    icon={<TrendingUp size={16} />}
                                    label="Blended conversion"
                                    value={
                                        totals.views > 0
                                            ? formatRate(
                                                  totals.acquisitions /
                                                      totals.views,
                                              )
                                            : "—"
                                    }
                                    sub="Acquisitions ÷ views"
                                />
                            </TileGrid>

                            <ChartCard
                                title={`Top 10 by ${metricLabel}`}
                                actions={controls}
                            >
                                <HBarList
                                    items={entries.slice(0, 10).map((entry) => ({
                                        key: String(entry.cosmetic_id),
                                        label: entryName(entry),
                                        value: metricOf(entry),
                                    }))}
                                    formatValue={(value) =>
                                        sort === "conversion"
                                            ? `${value.toFixed(1)}%`
                                            : formatNumber(value)
                                    }
                                    empty="No cosmetics matched this range."
                                />
                            </ChartCard>

                            <div className="flex flex-col gap-3 rounded-lg bg-gray-800 p-4 shadow-xl">
                                <div className="font-semibold text-gray-200">
                                    Every listed cosmetic
                                </div>
                                <DataTable
                                    maxHeight="32rem"
                                    data={{
                                        columns: [
                                            "Cosmetic",
                                            "ID",
                                            "Views",
                                            "Acquisitions",
                                            "Paid",
                                            "Granted",
                                            "Conversion",
                                            "Owners",
                                            "Equipped",
                                            "Shelf rate",
                                        ],
                                        rows: entries.map((entry) => [
                                            entryName(entry),
                                            formatNumber(entry.cosmetic_id),
                                            formatNumber(entry.views),
                                            formatNumber(entry.acquisitions),
                                            formatNumber(
                                                entry.acquisitions_paid,
                                            ),
                                            formatNumber(
                                                entry.acquisitions_granted,
                                            ),
                                            optional(
                                                entry.conversion,
                                                formatRate,
                                            ),
                                            optional(entry.owners, formatNumber),
                                            optional(
                                                entry.equipped,
                                                formatNumber,
                                            ),
                                            optional(
                                                entry.shelf_rate,
                                                formatRate,
                                            ),
                                        ]),
                                    }}
                                />
                            </div>
                        </div>
                    );
                }}
            </SectionBody>
        </Section>
    );
}
