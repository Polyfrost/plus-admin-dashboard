import { createFileRoute, Link } from "@tanstack/react-router";
import { RefreshCw, Store } from "lucide-react";
import { useAdminMutation } from "@/lib/store-api";
import { ErrorBanner, secondaryButton } from "@/components/store/shared";
import { ProductsPanel } from "@/components/store/ProductsPanel";
import { DiscountsPanel } from "@/components/store/DiscountsPanel";
import { TagsPanel } from "@/components/store/TagsPanel";
import { CollectionsPanel } from "@/components/store/CollectionsPanel";
import { OrdersPanel } from "@/components/store/OrdersPanel";
import { GrantsPanel } from "@/components/store/GrantsPanel";
import { ReferralsPanel } from "@/components/store/ReferralsPanel";

const TABS = [
    { id: "products", label: "Products", render: () => <ProductsPanel /> },
    { id: "sales", label: "Sales", render: () => <DiscountsPanel key="sale" kind="sale" /> },
    { id: "coupons", label: "Coupons", render: () => <DiscountsPanel key="coupon" kind="coupon" /> },
    { id: "tags", label: "Tags", render: () => <TagsPanel /> },
    { id: "referrals", label: "Referrals", render: () => <ReferralsPanel /> },
    { id: "collections", label: "Collections", render: () => <CollectionsPanel /> },
    { id: "orders", label: "Orders", render: () => <OrdersPanel /> },
    { id: "grants", label: "Grants", render: () => <GrantsPanel /> },
] as const;

type TabId = (typeof TABS)[number]["id"];

export const Route = createFileRoute("/store")({
    component: StoreRoute,
    validateSearch: (search: Record<string, unknown>): { tab?: TabId } => ({
        tab: TABS.find((candidate) => candidate.id === search.tab)?.id,
    }),
});

function StoreRoute() {
    const { tab: active = "products" } = Route.useSearch();
    const tab = TABS.find((candidate) => candidate.id === active) ?? TABS[0];

    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
                <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-100">
                    <Store size={22} className="text-[#61dafb]" />
                    Storefront
                </h1>
                <p className="mt-1 text-sm text-gray-500">
                    Everything here is saved in the plus backend, which mirrors
                    products, prices, sales, coupons and tags to PayNow.
                    Uploading and editing cosmetics lives on the Cosmetics page.
                </p>
            </div>
            <RefreshAssets />
            </div>

            <div className="flex flex-wrap gap-2 border-b border-gray-800">
                {TABS.map((candidate) => (
                    <Link
                        key={candidate.id}
                        to="/store"
                        search={{ tab: candidate.id }}
                        className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
                            candidate.id === active
                                ? "border-[#61dafb] text-[#61dafb]"
                                : "border-transparent text-gray-400 hover:text-gray-100"
                        }`}
                    >
                        {candidate.label}
                    </Link>
                ))}
            </div>

            {tab.render()}
        </div>
    );
}

interface RefreshResult {
    refreshed: number;
    failed: number;
    evicted: number;
}

/** Rebuilds the backend's asset hash cache after a change made outside the API. */
function RefreshAssets() {
    const refresh = useAdminMutation<void>(() => ({
        method: "POST",
        path: "/assets/refresh",
    }));
    const result = refresh.data as RefreshResult | undefined;

    return (
        <div className="flex flex-col items-end gap-1 text-sm">
            <button
                onClick={() => refresh.mutate()}
                disabled={refresh.isPending}
                title="Recompute every asset's cached hash, e.g. after replacing a file in storage or editing a hash in the database"
                className={secondaryButton}
            >
                <RefreshCw size={16} className={refresh.isPending ? "animate-spin" : ""} />
                {refresh.isPending ? "Refreshing…" : "Refresh asset cache"}
            </button>
            {result && (
                <span className="text-gray-500">
                    {result.refreshed} refreshed · {result.failed} failed · {result.evicted} evicted
                </span>
            )}
            <ErrorBanner error={refresh.error} />
        </div>
    );
}
