import type { UseQueryResult } from "@tanstack/react-query";
import { Eye, Gift, Layers, ShoppingCart, TrendingUp } from "lucide-react";
import {
    formatNumber,
    formatRate,
    type CatalogEntry,
    type CatalogResponse,
    type CatalogSort,
} from "@/lib/analytics";
import { rangeLabel } from "@/lib/analytics-range";
import { ChartCard, HBarList, Section, StatTile } from "@/components/viz";
import { SectionBody, TileGrid, optional } from "@/components/analytics/shared";

const CATALOG_SORTS: { id: CatalogSort; label: string }[] = [
    { id: "views", label: "Views" },
    { id: "acquisitions", label: "Acquisitions" },
    { id: "conversion", label: "Conversion" },
];

const entryName = (entry: CatalogEntry) =>
    entry.name?.trim() ? entry.name : `Cosmetic #${entry.cosmetic_id}`;

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
            description="Views are only counted when a cosmetic is opened, so one seen in a list but never opened does not register. Conversion can exceed 100% for cosmetics acquired in a bundle without being opened first. Paid counts Stripe checkouts that charged money and free the ones that came to zero — a checkout only records its session total, so every cosmetic in a mixed basket counts as paid."
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
                            free: sum.free + (entry.acquisitions_free ?? 0),
                            granted: sum.granted + entry.acquisitions_granted,
                        }),
                        {
                            views: 0,
                            acquisitions: 0,
                            paid: 0,
                            free: 0,
                            granted: 0,
                        },
                    );
                    // Backends older than the paid/free split count a
                    // zero-total checkout as paid and report no free figure.
                    const freeReported = entries.every(
                        (entry) =>
                            entry.acquisitions_free !== null &&
                            entry.acquisitions_free !== undefined,
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
                                    label="Paid acquisitions"
                                    value={formatNumber(totals.paid)}
                                    sub={`of ${formatNumber(totals.acquisitions)} acquisitions`}
                                />
                                <StatTile
                                    icon={<Gift size={16} />}
                                    label="Free acquisitions"
                                    value={formatNumber(
                                        freeReported
                                            ? totals.free + totals.granted
                                            : totals.granted,
                                    )}
                                    sub={
                                        freeReported
                                            ? `${formatNumber(totals.free)} zero-priced · ${formatNumber(totals.granted)} granted`
                                            : `${formatNumber(totals.granted)} granted · zero-priced not reported`
                                    }
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
                                table={{
                                    columns: [
                                        "Cosmetic",
                                        metricLabel.replace(/^./, (first) =>
                                            first.toUpperCase(),
                                        ),
                                    ],
                                    rows: entries
                                        .slice(0, 10)
                                        .map((entry) => [
                                            entryName(entry),
                                            sort === "conversion"
                                                ? `${metricOf(entry).toFixed(1)}%`
                                                : formatNumber(metricOf(entry)),
                                        ]),
                                }}
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

                            <ChartCard
                                title="Every listed cosmetic"
                                tableMaxHeight="32rem"
                                table={{
                                    columns: [
                                        "Cosmetic",
                                        "ID",
                                        "Views",
                                        "Acquisitions",
                                        "Paid",
                                        "Free",
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
                                        formatNumber(entry.acquisitions_paid),
                                        optional(entry.acquisitions_free),
                                        formatNumber(
                                            entry.acquisitions_granted,
                                        ),
                                        optional(entry.conversion, formatRate),
                                        optional(entry.owners),
                                        optional(entry.equipped),
                                        optional(entry.shelf_rate, formatRate),
                                    ]),
                                }}
                            />
                        </div>
                    );
                }}
            </SectionBody>
        </Section>
    );
}
