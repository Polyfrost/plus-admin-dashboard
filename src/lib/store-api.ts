import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRequiredSession, type Session } from "@/lib/session";

/** The resources the backend proxy will forward. */
export type StoreResource =
    | "sales"
    | "coupons"
    | "affiliate-links"
    | "upsell-settings";

/**
 * Calls the backend with the admin password. Every admin surface goes through
 * here so a failure reads the same wherever it happens.
 */
export async function adminRequest(
    session: Session,
    method: string,
    path: string,
    body?: unknown,
): Promise<unknown> {
    const response = await fetch(`${session.env}${path}`, {
        method,
        headers: {
            Authorization: session.password,
            "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
    });

    if (response.status === 204) return null;

    const text = await response.text();
    if (!response.ok) {
        // The backend answers with its own message — and the store proxy
        // passes PayNow's through — which says far more than a status code.
        throw new Error(text.trim() || `Request failed (${response.status})`);
    }

    return text ? JSON.parse(text) : null;
}

export function useStoreList<T>(resource: StoreResource) {
    const session = useRequiredSession();
    return useQuery<T>({
        queryKey: ["store", resource, session.env],
        queryFn: () =>
            adminRequest(session, "GET", `/v1/store/${resource}`) as Promise<T>,
        // The app disables queries by default so the expensive analytics ones
        // wait for a Load press. These lists are small and load on open.
        enabled: true,
    });
}

/** Invalidates the resource's list so a write is reflected without a reload. */
export function useStoreMutation<TVariables>(
    resource: StoreResource,
    build: (variables: TVariables) => {
        method: string;
        path: string;
        body?: unknown;
    },
) {
    const session = useRequiredSession();
    const queryClient = useQueryClient();

    return useMutation({
        mutationFn: (variables: TVariables) => {
            const { method, path, body } = build(variables);
            return adminRequest(
                session,
                method,
                `/v1/store/${resource}${path}`,
                body,
            );
        },
        onSuccess: () =>
            queryClient.invalidateQueries({
                queryKey: ["store", resource, session.env],
            }),
    });
}
