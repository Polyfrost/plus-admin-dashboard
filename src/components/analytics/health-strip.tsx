import type { UseQueryResult } from "@tanstack/react-query";
import { CircleCheck, CircleX, TriangleAlert } from "lucide-react";
import {
    formatDateTime,
    formatDayLabel,
    formatNumber,
    type HealthResponse,
} from "@/lib/analytics";

export function HealthStrip({
    query,
}: {
    query: UseQueryResult<HealthResponse>;
}) {
    if (query.error) {
        return (
            <div className="rounded border border-red-700 bg-red-900/40 px-4 py-3 text-sm text-red-200">
                Failed to load rollup health: {(query.error as Error).message}
            </div>
        );
    }
    const data = query.data;
    if (!data) return null;

    const age = data.watermark_age_days ?? null;
    const status = data.last_error
        ? {
              icon: <CircleX size={16} />,
              label: "Rollup failing",
              color: "#d03b3b",
          }
        : age !== null && age > 4
          ? {
                icon: <TriangleAlert size={16} />,
                label: "Rollup behind",
                color: "#fab219",
            }
          : {
                icon: <CircleCheck size={16} />,
                label: "Rollup healthy",
                color: "#0ca30c",
            };

    return (
        <div className="flex flex-col gap-2 rounded-lg bg-gray-800 p-4 shadow-xl">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                {/* Status is icon + label, never colour alone. */}
                <span
                    className="flex items-center gap-2 font-semibold"
                    style={{ color: status.color }}
                >
                    {status.icon}
                    {status.label}
                </span>
                <Fact
                    label="Rolled up days"
                    value={formatNumber(data.rolled_up_days)}
                />
                <Fact
                    label="Finalized through"
                    value={
                        data.finalized_through
                            ? formatDayLabel(data.finalized_through)
                            : "—"
                    }
                />
                <Fact
                    label="Watermark age"
                    value={age === null ? "—" : `${age} d`}
                />
                <Fact
                    label="Last run"
                    value={
                        data.last_run_at
                            ? formatDateTime(data.last_run_at)
                            : "never"
                    }
                />
                <Fact
                    label="Duration"
                    value={
                        data.last_run_ms === null ||
                        data.last_run_ms === undefined
                            ? "—"
                            : `${formatNumber(data.last_run_ms)} ms`
                    }
                />
            </div>
            {data.last_error && (
                <div className="rounded bg-red-900/30 px-3 py-2 font-mono text-xs text-red-200">
                    {data.last_error}
                </div>
            )}
        </div>
    );
}

function Fact({ label, value }: { label: string; value: string }) {
    return (
        <span className="flex items-baseline gap-2">
            <span className="text-gray-500">{label}</span>
            <span className="tabular-nums text-gray-200">{value}</span>
        </span>
    );
}
