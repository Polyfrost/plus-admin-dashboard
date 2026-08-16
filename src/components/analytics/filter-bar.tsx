import { RefreshCw } from "lucide-react";
import { ENV_OPTIONS } from "@/lib/settings";
import {
    RANGE_PRESETS,
    rangeLabel,
    type Range,
    type RangeId,
} from "@/lib/analytics-range";

/** Section anchors, in the order the page lays them out. */
export const SECTIONS = [
    { id: "overview", label: "Overview" },
    { id: "daily", label: "Daily" },
    { id: "retention", label: "Retention" },
    { id: "activity", label: "Activity" },
    { id: "sessions", label: "Sessions" },
    { id: "catalog", label: "Catalog" },
    { id: "monetization", label: "Monetization" },
    { id: "clients", label: "Clients" },
] as const;

/** The connection, the range every query shares, and the jump links. */
export function FilterBar({
    env,
    setEnv,
    password,
    setPassword,
    rangeId,
    setRangeId,
    customStart,
    setCustomStart,
    customEnd,
    setCustomEnd,
    range,
    spanDays,
    armed,
    fetching,
    onLoad,
}: {
    env: string;
    setEnv: (env: string) => void;
    password: string;
    setPassword: (password: string) => void;
    rangeId: RangeId;
    setRangeId: (id: RangeId) => void;
    customStart: string;
    setCustomStart: (day: string) => void;
    customEnd: string;
    setCustomEnd: (day: string) => void;
    range: Range;
    spanDays: number | null;
    armed: boolean;
    fetching: boolean;
    onLoad: () => void;
}) {
    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-4">
                <h1 className="text-2xl font-bold text-gray-100">Analytics</h1>
                <div className="flex flex-wrap items-center gap-2">
                    <select
                        value={env}
                        onChange={(event) => setEnv(event.target.value)}
                        className="rounded border border-gray-600 bg-gray-700 px-3 py-2 text-gray-200 focus:border-[#61dafb] focus:outline-none"
                    >
                        {ENV_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                                {option.label}
                            </option>
                        ))}
                    </select>
                    <input
                        type="password"
                        placeholder="Admin password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        className="rounded border border-gray-600 bg-gray-700 px-3 py-2 text-gray-200 focus:border-[#61dafb] focus:outline-none"
                    />
                    <button
                        onClick={onLoad}
                        disabled={!password || fetching}
                        className="flex items-center gap-2 rounded bg-[#61dafb] px-4 py-2 font-semibold text-gray-900 disabled:opacity-50"
                    >
                        <RefreshCw
                            size={16}
                            className={fetching ? "animate-spin" : ""}
                        />
                        {fetching ? "Loading…" : armed ? "Refresh" : "Load"}
                    </button>
                </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm text-gray-500">Range</span>
                {RANGE_PRESETS.map((preset) => (
                    <button
                        key={preset.id}
                        onClick={() => setRangeId(preset.id)}
                        className={`rounded border px-3 py-1 text-sm ${
                            rangeId === preset.id
                                ? "border-[#61dafb] text-[#61dafb]"
                                : "border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-200"
                        }`}
                    >
                        {preset.label}
                    </button>
                ))}
                {rangeId === "custom" && (
                    <span className="flex items-center gap-2">
                        <input
                            type="date"
                            value={customStart}
                            onChange={(event) =>
                                setCustomStart(event.target.value)
                            }
                            className="rounded border border-gray-600 bg-gray-700 px-2 py-1 text-sm text-gray-200"
                        />
                        <span className="text-gray-500">→</span>
                        <input
                            type="date"
                            value={customEnd}
                            onChange={(event) =>
                                setCustomEnd(event.target.value)
                            }
                            className="rounded border border-gray-600 bg-gray-700 px-2 py-1 text-sm text-gray-200"
                        />
                    </span>
                )}
                <span className="ml-auto text-sm text-gray-500">
                    {rangeLabel(range.start, range.end)}
                    {spanDays !== null && ` · ${spanDays} days`}
                </span>
            </div>

            <div className="flex flex-wrap items-center gap-1 border-t border-gray-800 pt-3">
                {SECTIONS.map((section) => (
                    <button
                        key={section.id}
                        onClick={() =>
                            document.getElementById(section.id)?.scrollIntoView({
                                behavior: "smooth",
                                block: "start",
                            })
                        }
                        className="rounded px-2 py-1 text-sm text-gray-500 hover:bg-gray-800 hover:text-gray-200"
                    >
                        {section.label}
                    </button>
                ))}
            </div>
        </div>
    );
}
