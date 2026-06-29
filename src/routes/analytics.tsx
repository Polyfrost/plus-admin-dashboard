import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
    Users,
    UserCheck,
    Package,
    Boxes,
    Clock,
    Timer,
    CalendarClock,
    Activity,
    RefreshCw,
} from "lucide-react";
import { ENV_OPTIONS, useEnv, usePassword } from "@/lib/settings";

export const Route = createFileRoute("/analytics")({
    component: Analytics,
});

interface AnalyticsOverview {
    total_users: number;
    monthly_active_users: number;
    owned_items_per_user: {
        total_owned_items: number;
        average_per_user: number;
        users_with_any: number;
        distribution: {
            "0": number;
            "1": number;
            "2_5": number;
            "6_10": number;
            "11_plus": number;
        };
    };
    playtime: {
        total_seconds: number;
        average_seconds_per_user: number;
        last_30d_seconds: number;
        total_sessions: number;
    };
}

const DISTRIBUTION_BUCKETS = [
    { key: "0", label: "0 items" },
    { key: "1", label: "1 item" },
    { key: "2_5", label: "2–5 items" },
    { key: "6_10", label: "6–10 items" },
    { key: "11_plus", label: "11+ items" },
] as const;

function formatDuration(totalSeconds: number): string {
    const seconds = Math.max(0, Math.round(totalSeconds));
    if (seconds < 60) return `${seconds}s`;

    const days = Math.floor(seconds / 86_400);
    const hours = Math.floor((seconds % 86_400) / 3_600);
    const minutes = Math.floor((seconds % 3_600) / 60);

    const parts: string[] = [];
    if (days) parts.push(`${days}d`);
    if (hours) parts.push(`${hours}h`);
    if (minutes) parts.push(`${minutes}m`);
    return parts.join(" ");
}

function formatNumber(value: number): string {
    return value.toLocaleString();
}

function percent(part: number, whole: number): string {
    if (whole <= 0) return "0%";
    return `${((part / whole) * 100).toFixed(1)}%`;
}

function StatCard({
    icon,
    label,
    value,
    sub,
}: {
    icon: React.ReactNode;
    label: string;
    value: string;
    sub?: string;
}) {
    return (
        <div className="bg-gray-800 p-4 rounded-lg shadow-xl flex flex-col gap-2">
            <div className="flex items-center gap-2 text-gray-400 text-sm">
                <span className="text-[#61dafb]">{icon}</span>
                <span>{label}</span>
            </div>
            <div className="text-2xl font-bold text-gray-100">{value}</div>
            {sub && <div className="text-xs text-gray-500">{sub}</div>}
        </div>
    );
}

function DistributionChart({
    distribution,
    totalUsers,
}: {
    distribution: AnalyticsOverview["owned_items_per_user"]["distribution"];
    totalUsers: number;
}) {
    const max = Math.max(
        1,
        ...DISTRIBUTION_BUCKETS.map((b) => distribution[b.key]),
    );

    return (
        <div className="bg-gray-800 p-4 rounded-lg shadow-xl flex flex-col gap-3">
            <div className="text-gray-300 font-semibold">
                Owned items per user
            </div>
            <div className="flex flex-col gap-2">
                {DISTRIBUTION_BUCKETS.map((bucket) => {
                    const count = distribution[bucket.key];
                    return (
                        <div key={bucket.key} className="flex flex-col gap-1">
                            <div className="flex justify-between text-sm text-gray-400">
                                <span>{bucket.label}</span>
                                <span className="font-mono text-gray-300">
                                    {formatNumber(count)} (
                                    {percent(count, totalUsers)})
                                </span>
                            </div>
                            <div className="h-3 bg-gray-700 rounded overflow-hidden">
                                <div
                                    className="h-full bg-[#61dafb] rounded"
                                    style={{
                                        width: `${(count / max) * 100}%`,
                                    }}
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function Analytics() {
    const [env, setEnv] = useEnv();
    const [password, setPassword] = usePassword();

    const { data, isFetching, error, refetch } = useQuery<AnalyticsOverview>({
        queryKey: ["analytics", env],
        queryFn: async () => {
            const res = await fetch(`${env}/analytics/overview`, {
                headers: { Authorization: password },
            });
            if (!res.ok) {
                const text = await res.text();
                throw new Error(`${res.status} ${text}`.trim());
            }
            return res.json();
        },
        enabled: false,
    });

    return (
        <div className="p-6 flex flex-col gap-6 max-w-5xl mx-auto w-full">
            <div className="flex items-center justify-between gap-4 flex-wrap">
                <h1 className="text-2xl font-bold text-gray-100">Analytics</h1>
                <div className="flex items-center gap-2 flex-wrap">
                    <select
                        value={env}
                        onChange={(e) => setEnv(e.target.value)}
                        className="bg-gray-700 text-gray-200 px-3 py-2 rounded border border-gray-600 focus:outline-none focus:border-[#61dafb]"
                    >
                        {ENV_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                    <input
                        type="password"
                        placeholder="Admin password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="bg-gray-700 text-gray-200 px-3 py-2 rounded border border-gray-600 focus:outline-none focus:border-[#61dafb]"
                    />
                    <button
                        onClick={() => refetch()}
                        disabled={!password || isFetching}
                        className="flex items-center gap-2 bg-[#61dafb] text-gray-900 font-semibold px-4 py-2 rounded disabled:opacity-50"
                    >
                        <RefreshCw
                            size={16}
                            className={isFetching ? "animate-spin" : ""}
                        />
                        {isFetching ? "Loading…" : "Load"}
                    </button>
                </div>
            </div>

            {error && (
                <div className="bg-red-900/40 border border-red-700 text-red-200 px-4 py-3 rounded">
                    Failed to load analytics: {(error as Error).message}
                </div>
            )}

            {!data && !error && (
                <div className="text-gray-500">
                    Enter the admin password and press Load.
                </div>
            )}

            {data && (
                <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        <StatCard
                            icon={<Users size={16} />}
                            label="Total users"
                            value={formatNumber(data.total_users)}
                        />
                        <StatCard
                            icon={<UserCheck size={16} />}
                            label="Monthly active users"
                            value={formatNumber(data.monthly_active_users)}
                            sub={`${percent(
                                data.monthly_active_users,
                                data.total_users,
                            )} of all users`}
                        />
                        <StatCard
                            icon={<Activity size={16} />}
                            label="Total sessions"
                            value={formatNumber(data.playtime.total_sessions)}
                        />
                        <StatCard
                            icon={<Package size={16} />}
                            label="Total owned items"
                            value={formatNumber(
                                data.owned_items_per_user.total_owned_items,
                            )}
                        />
                        <StatCard
                            icon={<Boxes size={16} />}
                            label="Avg items / user"
                            value={data.owned_items_per_user.average_per_user.toFixed(
                                2,
                            )}
                            sub={`${formatNumber(
                                data.owned_items_per_user.users_with_any,
                            )} users own at least one`}
                        />
                        <StatCard
                            icon={<Clock size={16} />}
                            label="Total playtime"
                            value={formatDuration(
                                data.playtime.total_seconds,
                            )}
                        />
                        <StatCard
                            icon={<Timer size={16} />}
                            label="Avg playtime / user"
                            value={formatDuration(
                                data.playtime.average_seconds_per_user,
                            )}
                        />
                        <StatCard
                            icon={<CalendarClock size={16} />}
                            label="Playtime (last 30d)"
                            value={formatDuration(
                                data.playtime.last_30d_seconds,
                            )}
                        />
                    </div>

                    <DistributionChart
                        distribution={data.owned_items_per_user.distribution}
                        totalUsers={data.total_users}
                    />
                </>
            )}
        </div>
    );
}
