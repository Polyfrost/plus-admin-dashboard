import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { analyticsGet, type QueryParams } from "@/lib/analytics";

interface QueryOptions {
    env: string;
    password: string;
    enabled: boolean;
    /** Bumped by the Load button so a refetch happens even on an identical range. */
    nonce: number;
    params?: QueryParams;
}

export function useAnalyticsQuery<T>(path: string, options: QueryOptions) {
    const params = options.params ?? {};
    return useQuery<T>({
        queryKey: ["analytics", path, options.env, params, options.nonce],
        queryFn: () =>
            analyticsGet<T>(options.env, options.password, path, params),
        enabled: options.enabled,
        // Hold the previous render while a new range loads — no skeleton flash.
        placeholderData: keepPreviousData,
    });
}
