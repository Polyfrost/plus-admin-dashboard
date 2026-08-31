import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRequiredSession, type Session } from "@/lib/session";

/** The resources the backend proxy will forward. */
export type StoreResource =
    | "sales"
    | "coupons"
    | "affiliate-links"
    | "upsell-settings";

async function request(
    session: Session,
    method: string,
    path: string,
    body?: unknown,
): Promise<unknown> {
    const response = await fetch(`${session.env}/v1/store${path}`, {
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
        // The proxy passes PayNow's own message through, which says far more
        // than a status code does.
        throw new Error(text.trim() || `Request failed (${response.status})`);
    }

    return text ? JSON.parse(text) : null;
}

export function useStoreList<T>(resource: StoreResource) {
    const session = useRequiredSession();
    return useQuery<T>({
        queryKey: ["store", resource, session.env],
        queryFn: () => request(session, "GET", `/${resource}`) as Promise<T>,
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
            return request(session, method, `/${resource}${path}`, body);
        },
        onSuccess: () =>
            queryClient.invalidateQueries({
                queryKey: ["store", resource, session.env],
            }),
    });
}
