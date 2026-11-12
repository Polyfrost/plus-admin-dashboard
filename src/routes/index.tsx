import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useRequiredMe } from "@/lib/session";
import { PAGES, hasAny } from "@/lib/permissions";

export const Route = createFileRoute("/")({
    component: Index,
});

/** Lands on the first page the signed-in player may open. */
function Index() {
    const { permissions } = useRequiredMe();
    const page = PAGES.find((candidate) => hasAny(permissions, candidate.perm));

    if (!page) {
        return (
            <p className="p-6 text-gray-400">
                Your roles do not grant any dashboard pages.
            </p>
        );
    }
    return <Navigate to={page.to} replace />;
}
