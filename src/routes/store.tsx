import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Store } from "lucide-react";
import { SalesPanel } from "@/components/store/SalesPanel";
import { CouponsPanel } from "@/components/store/CouponsPanel";
import { AffiliatesPanel } from "@/components/store/AffiliatesPanel";
import { UpsellsPanel } from "@/components/store/UpsellsPanel";

export const Route = createFileRoute("/store")({
    component: StoreRoute,
});

const TABS = [
    { id: "sales", label: "Sales", render: () => <SalesPanel /> },
    { id: "coupons", label: "Coupons", render: () => <CouponsPanel /> },
    { id: "affiliates", label: "Affiliates", render: () => <AffiliatesPanel /> },
    { id: "upsells", label: "Upsells", render: () => <UpsellsPanel /> },
] as const;

function StoreRoute() {
    const [active, setActive] = useState<(typeof TABS)[number]["id"]>("sales");
    const tab = TABS.find((candidate) => candidate.id === active) ?? TABS[0];

    return (
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 p-6">
            <div>
                <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-100">
                    <Store size={22} className="text-[#61dafb]" />
                    Storefront
                </h1>
                <p className="mt-1 text-sm text-gray-500">
                    These live in PayNow, not in the plus database. Cosmetic and
                    bundle pricing stays where it is, under Cosmetics.
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
