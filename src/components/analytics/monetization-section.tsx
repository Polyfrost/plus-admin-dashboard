import type { UseQueryResult } from "@tanstack/react-query";
import {
    CreditCard,
    Gift,
    Percent,
    ShoppingCart,
    Undo2,
    Users,
    Wallet,
} from "lucide-react";
import {
    formatCompact,
    formatDayLabel,
    formatMinor,
    formatNumber,
    percent,
    type MonetizationResponse,
} from "@/lib/analytics";
import { rangeLabel } from "@/lib/analytics-range";
import {
    ChartCard,
    ColumnChart,
    LineChart,
    SERIES_COLORS,
    Section,
    StatTile,
    type ChartSeries,
} from "@/components/viz";
import { SectionBody, TileGrid, seriesTable } from "@/components/analytics/shared";

/** Minor units are converted once, here, so the charts plot major units. */
const major = (minor: number) => minor / 100;
const amount = (value: number) => value.toFixed(2);

export function MonetizationSection({
    query,
}: {
    query: UseQueryResult<MonetizationResponse>;
}) {
    return (
        <Section
            id="monetization"
            title="Revenue & refunds"
            description="Amounts are minor units divided by 100; the API does not report a currency, and it never converts between them, so a store selling in more than one produces a meaningless sum. A sale stays booked on the day it was made even if it is refunded later — the refund books separately, on the day it was processed."
        >
            <SectionBody query={query} what="monetization">
                {(data, dimmed) => {
                    const days = data.days;
                    const labels = days.map((day) => formatDayLabel(day.day));

                    const revenue: ChartSeries[] = [
                        {
                            key: "gross",
                            name: "Gross",
                            color: SERIES_COLORS[0],
                            values: days.map((day) =>
                                major(day.gross_revenue_minor),
                            ),
                        },
                        {
                            key: "refunds",
                            name: "Refunds",
                            color: SERIES_COLORS[1],
                            values: days.map((day) =>
                                major(day.refund_amount_minor),
                            ),
                        },
                        {
                            key: "discounts",
                            name: "Discounts",
                            color: SERIES_COLORS[2],
                            values: days.map((day) =>
                                major(day.discount_amount_minor),
                            ),
                        },
                    ];
                    const transactions: ChartSeries[] = [
                        {
                            key: "completed",
                            name: "Completed",
                            color: SERIES_COLORS[0],
                            values: days.map(
                                (day) => day.transactions_completed,
                            ),
                        },
                        {
                            key: "refunded",
                            name: "Refunded",
                            color: SERIES_COLORS[1],
                            values: days.map((day) => day.transactions_refunded),
                        },
                        {
                            key: "gifts",
                            name: "Gifts",
                            color: SERIES_COLORS[2],
                            values: days.map((day) => day.gift_transactions),
                        },
                    ];
                    const payers: ChartSeries[] = [
                        {
                            key: "paying_users",
                            name: "Paying users",
                            color: SERIES_COLORS[0],
                            values: days.map((day) => day.paying_users),
                        },
                    ];

                    return (
                        <div
                            className={`flex flex-col gap-4 ${dimmed ? "opacity-50" : ""}`}
                        >
                            <TileGrid>
                                <StatTile
                                    icon={<Wallet size={16} />}
                                    label="Net revenue"
                                    value={formatMinor(data.net_revenue_minor)}
                                    sub={rangeLabel(data.start, data.end)}
                                />
                                <StatTile
                                    icon={<CreditCard size={16} />}
                                    label="Gross revenue"
                                    value={formatMinor(data.gross_revenue_minor)}
                                />
                                <StatTile
                                    icon={<Undo2 size={16} />}
                                    label="Refunded"
                                    value={formatMinor(data.refund_amount_minor)}
                                    sub={`${percent(data.refund_amount_minor, data.gross_revenue_minor)} of gross`}
                                />
                                <StatTile
                                    icon={<Percent size={16} />}
                                    label="Discounts given"
                                    value={formatMinor(
                                        data.discount_amount_minor,
                                    )}
                                />
                                <StatTile
                                    icon={<ShoppingCart size={16} />}
                                    label="Transactions"
                                    value={formatNumber(
                                        data.transactions_completed,
                                    )}
                                    sub="Sales made in the range"
                                />
                                <StatTile
                                    icon={<Undo2 size={16} />}
                                    label="Later refunded"
                                    value={formatNumber(
                                        data.transactions_refunded,
                                    )}
                                    sub="Of the sales made in the range"
                                />
                                <StatTile
                                    icon={<Gift size={16} />}
                                    label="Gift transactions"
                                    value={formatNumber(data.gift_transactions)}
                                />
                                <StatTile
                                    icon={<Users size={16} />}
                                    label="Paying user-days"
                                    value={formatNumber(data.paying_user_days)}
                                    sub="Distinct payers per day, summed"
                                />
                            </TileGrid>

                            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                                <ChartCard
                                    title="Revenue per day"
                                    subtitle="Major units, currency as sold"
                                    table={seriesTable(
                                        "Day",
                                        labels,
                                        revenue,
                                        amount,
                                    )}
                                >
                                    <LineChart
                                        labels={labels}
                                        series={revenue}
                                        formatValue={amount}
                                        formatTick={formatCompact}
                                    />
                                </ChartCard>

                                <ChartCard
                                    title="Transactions per day"
                                    table={seriesTable(
                                        "Day",
                                        labels,
                                        transactions,
                                    )}
                                >
                                    <LineChart
                                        labels={labels}
                                        series={transactions}
                                    />
                                </ChartCard>

                                <ChartCard
                                    title="Paying users per day"
                                    subtitle="Distinct payers each day"
                                    table={seriesTable("Day", labels, payers)}
                                >
                                    <ColumnChart
                                        labels={labels}
                                        series={payers}
                                    />
                                </ChartCard>

                                <ChartCard
                                    title="Every monetization field"
                                    subtitle="Per day, as stored"
                                    table={{
                                        columns: [
                                            "Day",
                                            "Gross",
                                            "Refunds",
                                            "Discounts",
                                            "Completed",
                                            "Refunded",
                                            "Gifts",
                                            "Paying users",
                                        ],
                                        rows: days.map((day) => [
                                            formatDayLabel(day.day),
                                            formatMinor(day.gross_revenue_minor),
                                            formatMinor(day.refund_amount_minor),
                                            formatMinor(
                                                day.discount_amount_minor,
                                            ),
                                            formatNumber(
                                                day.transactions_completed,
                                            ),
                                            formatNumber(
                                                day.transactions_refunded,
                                            ),
                                            formatNumber(day.gift_transactions),
                                            formatNumber(day.paying_users),
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
