import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Store } from "lucide-react";
import { ProductsPanel } from "@/components/store/ProductsPanel";
import { DiscountsPanel } from "@/components/store/DiscountsPanel";
import { TagsPanel } from "@/components/store/TagsPanel";
import { OrdersPanel } from "@/components/store/OrdersPanel";
import { GrantsPanel } from "@/components/store/GrantsPanel";

export const Route = createFileRoute("/store")({
    component: StoreRoute,
});

const TABS = [
    { id: "products", label: "Products", render: () => <ProductsPanel /> },
    { id: "sales", label: "Sales", render: () => <DiscountsPanel key="sale" kind="sale" /> },
    { id: "coupons", label: "Coupons", render: () => <DiscountsPanel key="coupon" kind="coupon" /> },
    { id: "tags", label: "Tags", render: () => <TagsPanel /> },
    { id: "orders", label: "Orders", render: () => <OrdersPanel /> },
    { id: "grants", label: "Grants", render: () => <GrantsPanel /> },
] as const;

function StoreRoute() {
    const [active, setActive] = useState<(typeof TABS)[number]["id"]>("products");
    const tab = TABS.find((candidate) => candidate.id === active) ?? TABS[0];

    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
            <div>
                <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-100">
                    <Store size={22} className="text-[#61dafb]" />
                    Storefront
                </h1>
                <p className="mt-1 text-sm text-gray-500">
                    Everything here is saved in the plus backend, which mirrors
                    products, prices, sales, coupons and tags to PayNow.
                    Uploading cosmetics stays on the Dashboard page.
                </p>
            </div>

            <div className="flex flex-wrap gap-2 border-b border-gray-800">
                {TABS.map((candidate) => (
                    <button
                        key={candidate.id}
                        onClick={() => setActive(candidate.id)}
                        className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
                            candidate.id === active
                                ? "border-[#61dafb] text-[#61dafb]"
                                : "border-transparent text-gray-400 hover:text-gray-100"
                        }`}
                    >
                        {candidate.label}
                    </button>
                ))}
            </div>

            {tab.render()}
        </div>
    );
}
