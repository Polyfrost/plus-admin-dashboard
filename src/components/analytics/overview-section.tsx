import type { UseQueryResult } from "@tanstack/react-query";
import {
    Activity,
    Boxes,
    CalendarClock,
    Clock,
    Hourglass,
    Package,
    ShoppingCart,
    Timer,
    UserCheck,
    UserPlus,
    Users,
} from "lucide-react";
import {
    formatDuration,
    formatNumber,
    percent,
    type OverviewResponse,
} from "@/lib/analytics";
import { rangeLabel } from "@/lib/analytics-range";
import { ChartCard, HBarList, Section, StatTile } from "@/components/viz";
import { SectionBody, TileGrid } from "@/components/analytics/shared";

const DISTRIBUTION_BUCKETS = [
    { key: "0", label: "0 items" },
    { key: "1", label: "1 item" },
    { key: "2_5", label: "2–5 items" },
    { key: "6_10", label: "6–10 items" },
    { key: "11_plus", label: "11+ items" },
] as const;

export function OverviewSection({
    query,
}: {
    query: UseQueryResult<OverviewResponse>;
}) {
    return (
        <Section
            id="overview"
            title="Overview"
            description="Cumulative figures (total users, owned items) are a snapshot at the end of the range; flow figures (new users, items acquired, playtime, sessions) only count what happened inside it."
        >
            <SectionBody query={query} what="the overview">
                {(data, dimmed) => {
                    const owned = data.owned_items_per_user;
                    const play = data.playtime;
                    const buckets = DISTRIBUTION_BUCKETS.map((bucket) => ({
                        key: bucket.key,
                        label: bucket.label,
                        value: owned.distribution[bucket.key],
                    }));
                    const bucketTotal = buckets.reduce(
                        (sum, bucket) => sum + bucket.value,
                        0,
                    );

                    return (
                        <div
                            className={`flex flex-col gap-4 ${dimmed ? "opacity-50" : ""}`}
                        >
                            <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
                                <StatTile
                                    hero
                                    icon={<Users size={16} />}
                                    label="Total users"
                                    value={formatNumber(data.total_users)}
                                    sub={rangeLabel(
                                        data.period.start,
                                        data.period.end,
                                    )}
                                />
                                <StatTile
                                    icon={<UserPlus size={16} />}
                                    label="New users"
                                    value={formatNumber(data.new_users)}
                                    sub="Signed up inside the range"
                                />
                                <StatTile
                                    icon={<UserCheck size={16} />}
                                    label="Monthly active users"
                                    value={formatNumber(
                                        data.monthly_active_users,
                                    )}
                                    sub={`${percent(data.monthly_active_users, data.total_users)} of all users`}
                                />
                                <StatTile
                                    icon={<Activity size={16} />}
                                    label="Sessions"
                                    value={formatNumber(play.total_sessions)}
                                />
                            </div>

                            <TileGrid>
                                <StatTile
                                    icon={<Package size={16} />}
                                    label="Owned items"
                                    value={formatNumber(owned.total_owned_items)}
                                />
                                <StatTile
                                    icon={<ShoppingCart size={16} />}
                                    label="Items acquired"
                                    value={formatNumber(owned.items_acquired)}
                                    sub="Inside the range"
                                />
                                <StatTile
                                    icon={<Boxes size={16} />}
                                    label="Avg items / user"
                                    value={owned.average_per_user.toFixed(2)}
                                />
                                <StatTile
                                    icon={<Users size={16} />}
                                    label="Users owning anything"
                                    value={formatNumber(owned.users_with_any)}
                                    sub={`${percent(owned.users_with_any, data.total_users)} of all users`}
                                />
                                <StatTile
                                    icon={<Clock size={16} />}
                                    label="Total playtime"
                                    value={formatDuration(play.total_seconds)}
                                />
                                <StatTile
                                    icon={<Timer size={16} />}
                                    label="Avg playtime / user"
                                    value={formatDuration(
                                        play.average_seconds_per_user,
                                    )}
                                />
                                <StatTile
                                    icon={<CalendarClock size={16} />}
                                    label="Playtime, last 30 days"
                                    value={formatDuration(play.last_30d_seconds)}
                                    sub="Always the last 30 days, not the range"
                                />
                                <StatTile
                                    icon={<Hourglass size={16} />}
                                    label="Avg session length"
                                    value={
                                        play.total_sessions > 0
                                            ? formatDuration(
                                                  play.total_seconds /
                                                      play.total_sessions,
                                              )
                                            : "—"
                                    }
                                    sub="Total playtime ÷ sessions"
                                />
                            </TileGrid>

                            <ChartCard
                                title="Owned items per user"
                                subtitle={`${formatNumber(bucketTotal)} users across the five buckets`}
                            >
                                <HBarList
                                    items={buckets.map((bucket) => ({
                                        ...bucket,
                                        sub: `(${percent(bucket.value, bucketTotal)})`,
                                    }))}
                                />
                            </ChartCard>
                        </div>
                    );
                }}
            </SectionBody>
        </Section>
    );
}
