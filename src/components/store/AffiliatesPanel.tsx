import { useState } from "react";
import { Plus } from "lucide-react";
import { useStoreList, useStoreMutation } from "@/lib/store-api";
import {
    DeleteButton,
    ErrorBanner,
    Field,
    Panel,
    PayloadPreview,
    Table,
    Toggle,
    inputClass,
    percentToTenths,
    tenthsToPercent,
} from "./shared";

interface AffiliateLink {
    id: string;
    code: string;
    enabled: boolean;
    commission_type: string;
    commission_amount: number;
    discount_type: string;
    discount_amount: number;
    tracking_length_days: number;
}

export function AffiliatesPanel() {
    const list = useStoreList<AffiliateLink[]>("affiliate-links");
    const [code, setCode] = useState("");
    const [walletId, setWalletId] = useState("");
    const [commission, setCommission] = useState("10");
    const [discount, setDiscount] = useState("0");
    const [trackingDays, setTrackingDays] = useState("30");
    const [enabled, setEnabled] = useState(true);

    const discountTenths = percentToTenths(discount);
    const body = {
        wallet_id: walletId.trim(),
        enabled,
        code: code.trim(),
        referer_type: "last_referer",
        tracking_length_days: Number(trackingDays) || 0,
        apply_for_subscriptions: false,
        discount_type: discountTenths > 0 ? "percentage" : "none",
        discount_amount: discountTenths,
        commission_type: "percentage",
        commission_amount: percentToTenths(commission),
        commission_amount_steps: [],
        last_commission_amount_step_repeats: false,
    };

    const create = useStoreMutation<void>("affiliate-links", () => ({
        method: "POST",
        path: "",
        body,
    }));
    const remove = useStoreMutation<string>("affiliate-links", (id) => ({
        method: "DELETE",
        path: `/${id}`,
    }));
    const toggle = useStoreMutation<AffiliateLink>(
        "affiliate-links",
        (link) => ({
            method: "PATCH",
            path: `/${link.id}`,
            body: { enabled: !link.enabled },
        }),
    );

    return (
        <Panel
            title="Affiliate links"
            description="Creator codes that pay a commission and can hand the buyer a discount. The store passes an affiliate code through to PayNow at checkout; unlike a coupon, an unrecognised one is ignored rather than rejected. Commission is paid out of a PayNow wallet, so a wallet id is required."
        >
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    create.mutate();
                }}
                className="flex flex-col gap-3 rounded-lg bg-gray-800 p-4 shadow-xl"
            >
                <div className="font-semibold text-gray-300">
                    Create an affiliate link
                </div>
                <div className="flex flex-wrap gap-3">
                    <Field label="Code">
                        <input
                            value={code}
                            onChange={(event) => setCode(event.target.value)}
                            required
                            placeholder="creator-name"
                            className={inputClass}
                        />
                    </Field>
                    <Field
                        label="Wallet id"
                        help="From PayNow — this is who gets paid"
                    >
                        <input
                            value={walletId}
                            onChange={(event) => setWalletId(event.target.value)}
                            required
                            className={inputClass}
                        />
                    </Field>
                </div>
                <div className="flex flex-wrap gap-3">
                    <Field
                        label="Commission %"
                        help="A real percentage — 10 pays a tenth of each sale"
                    >
                        <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            value={commission}
                            onChange={(event) =>
                                setCommission(event.target.value)
                            }
                            required
                            className={inputClass}
                        />
                    </Field>
                    <Field
                        label="Buyer discount %"
                        help="0 gives the buyer nothing"
                    >
                        <input
                            type="number"
                            min="0"
                            max="100"
                            step="0.1"
                            value={discount}
                            onChange={(event) => setDiscount(event.target.value)}
                            className={inputClass}
                        />
                    </Field>
                    <Field label="Tracking days">
                        <input
                            type="number"
                            min="0"
                            value={trackingDays}
                            onChange={(event) =>
                                setTrackingDays(event.target.value)
                            }
                            required
                            className={inputClass}
                        />
                    </Field>
                </div>
                <Toggle
                    label="Enabled"
                    checked={enabled}
                    onChange={setEnabled}
                />
                <PayloadPreview body={body} />
                <ErrorBanner error={create.error} />
                <button
                    type="submit"
                    disabled={!code.trim() || !walletId.trim() || create.isPending}
                    className="flex w-fit items-center gap-2 rounded bg-[#61dafb] px-4 py-2 font-semibold text-gray-900 disabled:opacity-50"
                >
                    <Plus size={16} />
                    {create.isPending ? "Creating…" : "Create link"}
                </button>
            </form>

            <ErrorBanner error={list.error ?? remove.error ?? toggle.error} />

            <Table
                headers={["Code", "Commission", "Buyer discount", "Tracking", "Enabled", ""]}
                empty={!list.data?.length}
            >
                {list.data?.map((link) => (
                    <tr key={link.id}>
                        <td className="px-4 py-3 font-mono">{link.code}</td>
                        <td className="px-4 py-3">
                            {tenthsToPercent(link.commission_amount)}%
                        </td>
                        <td className="px-4 py-3">
                            {link.discount_type === "none"
                                ? "—"
                                : `${tenthsToPercent(link.discount_amount)}%`}
                        </td>
                        <td className="px-4 py-3 text-gray-500">
                            {link.tracking_length_days} days
                        </td>
                        <td className="px-4 py-3">
                            <Toggle
                                label={link.enabled ? "On" : "Off"}
                                checked={link.enabled}
                                onChange={() => toggle.mutate(link)}
                            />
                        </td>
                        <td className="px-4 py-3">
                            <DeleteButton
                                onDelete={() => remove.mutate(link.id)}
                                pending={remove.isPending}
                            />
                        </td>
                    </tr>
                ))}
            </Table>
        </Panel>
    );
}
