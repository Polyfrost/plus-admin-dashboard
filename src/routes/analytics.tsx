import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useEnv, usePassword } from "@/lib/settings";
import {
    daySpan,
    shiftDay,
    utcToday,
    type ActivityResponse,
    type CatalogResponse,
    type CatalogSort,
    type ClientsResponse,
    type DailyResponse,
    type HealthResponse,
    type MonetizationResponse,
    type OverviewResponse,
    type QueryParams,
    type RetentionResponse,
    type SessionsResponse,
} from "@/lib/analytics";
import { useAnalyticsQuery } from "@/lib/analytics-query";
import {
    MAX_HOURLY_SPAN_DAYS,
    resolveRange,
    type RangeId,
} from "@/lib/analytics-range";
import { FilterBar } from "@/components/analytics/filter-bar";
import { HealthStrip } from "@/components/analytics/health-strip";
import { OverviewSection } from "@/components/analytics/overview-section";
import { DailySection } from "@/components/analytics/daily-section";
import { RetentionSection } from "@/components/analytics/retention-section";
import { ActivitySection } from "@/components/analytics/activity-section";
import { SessionsSection } from "@/components/analytics/sessions-section";
import { CatalogSection } from "@/components/analytics/catalog-section";
import { MonetizationSection } from "@/components/analytics/monetization-section";
import { ClientsSection } from "@/components/analytics/clients-section";

export const Route = createFileRoute("/analytics")({
    component: Analytics,
});

function Analytics() {
    const [env, setEnv] = useEnv();
    const [password, setPassword] = usePassword();

    const [rangeId, setRangeId] = useState<RangeId>("30d");
    const [customStart, setCustomStart] = useState(() =>
        shiftDay(utcToday(), -29),
    );
    const [customEnd, setCustomEnd] = useState(() => utcToday());
    const [catalogSort, setCatalogSort] = useState<CatalogSort>("views");
    const [catalogLimit, setCatalogLimit] = useState(50);

    const [armed, setArmed] = useState(false);
    const [nonce, setNonce] = useState(0);

    const range = useMemo(
        () => resolveRange(rangeId, customStart, customEnd),
        [rangeId, customStart, customEnd],
    );
    const params: QueryParams = { start: range.start, end: range.end };
    const enabled = armed && password.length > 0;

    const spanDays =
        range.start && range.end ? daySpan(range.start, range.end) : null;
    const hourlyAvailable =
        spanDays !== null && spanDays > 0 && spanDays <= MAX_HOURLY_SPAN_DAYS;

    const base = { env, password, nonce };

    const overview = useAnalyticsQuery<OverviewResponse>("/overview", {
        ...base,
        enabled,
        params,
    });
    const daily = useAnalyticsQuery<DailyResponse>("/daily", {
        ...base,
        enabled,
        params,
    });
    const retention = useAnalyticsQuery<RetentionResponse>("/retention", {
        ...base,
        enabled,
        params,
    });
    const activity = useAnalyticsQuery<ActivityResponse>("/activity", {
        ...base,
        enabled,
        params: { ...params, shape: "heatmap" },
    });
    const hourly = useAnalyticsQuery<ActivityResponse>("/activity", {
        ...base,
        enabled: enabled && hourlyAvailable,
        params: { ...params, shape: "series" },
    });
    const sessions = useAnalyticsQuery<SessionsResponse>("/sessions", {
        ...base,
        enabled,
        params,
    });
    const catalog = useAnalyticsQuery<CatalogResponse>("/catalog", {
        ...base,
        enabled,
        params: { ...params, sort: catalogSort, limit: catalogLimit },
    });
    const monetization = useAnalyticsQuery<MonetizationResponse>(
        "/monetization",
        { ...base, enabled, params },
    );
    const clients = useAnalyticsQuery<ClientsResponse>("/clients", {
        ...base,
        enabled,
        params,
    });
    const health = useAnalyticsQuery<HealthResponse>("/health", {
        ...base,
        enabled,
    });

    const anyFetching = [
        overview,
        daily,
        retention,
        activity,
        hourly,
        sessions,
        catalog,
        monetization,
        clients,
        health,
    ].some((query) => query.isFetching);

    return (
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-8 p-6">
            <FilterBar
                env={env}
                setEnv={setEnv}
                password={password}
                setPassword={setPassword}
                rangeId={rangeId}
                setRangeId={setRangeId}
                customStart={customStart}
                setCustomStart={setCustomStart}
                customEnd={customEnd}
                setCustomEnd={setCustomEnd}
                range={range}
                spanDays={spanDays}
                armed={armed}
                fetching={anyFetching}
                onLoad={() => {
                    setArmed(true);
                    setNonce((value) => value + 1);
                }}
            />

            <HealthStrip query={health} />

            <OverviewSection query={overview} />
            <DailySection query={daily} />
            <RetentionSection query={retention} />
            <ActivitySection
                heatmap={activity}
                hourly={hourly}
                hourlyAvailable={hourlyAvailable}
            />
            <SessionsSection query={sessions} />
            <CatalogSection
                query={catalog}
                sort={catalogSort}
                setSort={setCatalogSort}
                limit={catalogLimit}
                setLimit={setCatalogLimit}
            />
            <MonetizationSection query={monetization} />
            <ClientsSection query={clients} />
        </div>
    );
}
