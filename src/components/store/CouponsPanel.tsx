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
    describeDiscount,
    inputClass,
    toDiscountAmount,
} from "./shared";

interface Coupon {
    id: string;
    code: string;
    enabled: boolean;
    discount_type: string;
    discount_amount: number;
    expires_at: string | null;
    redeem_limit_store_enabled: boolean;
    redeem_limit_store_amount: number;
}

export function CouponsPanel() {
    const list = useStoreList<Coupon[]>("coupons");
    const [code, setCode] = useState("");
    const [type, setType] = useState<"percent" | "amount">("percent");
    const [amount, setAmount] = useState("10");
    const [expiresAt, setExpiresAt] = useState("");
    const [limited, setLimited] = useState(false);
    const [limit, setLimit] = useState("100");
    const [enabled, setEnabled] = useState(true);

    const body = {
        enabled,
        code: code.trim().toUpperCase(),
        duration: "once",
        discount_type: type,
        discount_amount: toDiscountAmount(type, amount),
        discount_apply_individually: false,
        discount_apply_before_sales: false,
        minimum_order_value: 0,
        redeem_limit_store_enabled: limited,
        redeem_limit_store_amount: limited ? Number(limit) || 0 : 0,
        redeem_limit_customer_enabled: true,
        redeem_limit_customer_amount: 1,
        usable_on_one_time_purchase: true,
        usable_on_subscription: false,
        expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
    };

    const create = useStoreMutation<void>("coupons", () => ({
        method: "POST",
        path: "",
        body,
    }));
    const remove = useStoreMutation<string>("coupons", (id) => ({
        method: "DELETE",
        path: `/${id}`,
    }));
    const toggle = useStoreMutation<Coupon>("coupons", (coupon) => ({
        method: "PATCH",
        path: `/${coupon.id}`,
        body: { enabled: !coupon.enabled },
    }));

    return (
        <Panel
            title="Coupons"
            description="Codes buyers type at checkout. The store already accepts them — the coupon box on the checkout page passes them through, and an invalid one fails the checkout with PayNow's own message rather than a generic error. Each coupon here defaults to one use per customer."
        >
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    create.mutate();
                }}
                className="flex flex-col gap-3 rounded-lg bg-gray-800 p-4 shadow-xl"
            >
                <div className="font-semibold text-gray-300">
                    Create a coupon
                </div>
                <div className="flex flex-wrap gap-3">
                    <Field label="Code" help="Shown to buyers in upper case">
                        <input
                            value={code}
                            onChange={(event) => setCode(event.target.value)}
                            required
                            placeholder="SUMMER20"
                            className={inputClass}
                        />
                    </Field>
                    <Field label="Type">
                        <select
                            value={type}
                            onChange={(event) =>
                                setType(event.target.value as "percent" | "amount")
                            }
                            className={inputClass}
                        >
                            <option value="percent">Percent off</option>
                            <option value="amount">Fixed amount off</option>
                        </select>
                    </Field>
                    <Field
                        label={type === "percent" ? "Percent off" : "Cents off"}
                        help={
                            type === "percent"
                                ? "A real percentage — 25 takes a quarter off"
                                : "Smallest currency unit — 250 takes 2.50 off"
                        }
                    >
                        <input
                            type="number"
                            min="0"
                            max={type === "percent" ? "100" : undefined}
                            step={type === "percent" ? "0.1" : "1"}
                            value={amount}
                            onChange={(event) => setAmount(event.target.value)}
                            required
                            className={inputClass}
                        />
                    </Field>
                </div>
                <div className="flex flex-wrap gap-3">
                    <Field label="Expires" help="Leave empty for no expiry">
                        <input
                            type="datetime-local"
                            value={expiresAt}
                            onChange={(event) =>
                                setExpiresAt(event.target.value)
                            }
                            className={inputClass}
                        />
                    </Field>
                    {limited && (
                        <Field label="Total redemptions">
                            <input
                                type="number"
                                min="1"
                                value={limit}
                                onChange={(event) => setLimit(event.target.value)}
                                className={inputClass}
                            />
                        </Field>
                    )}
                </div>
                <div className="flex flex-wrap gap-4">
                    <Toggle
                        label="Cap total redemptions"
                        checked={limited}
                        onChange={setLimited}
                    />
                    <Toggle
                        label="Enabled"
                        checked={enabled}
                        onChange={setEnabled}
                    />
                </div>
                <PayloadPreview body={body} />
                <ErrorBanner error={create.error} />
                <button
                    type="submit"
                    disabled={!code.trim() || create.isPending}
                    className="flex w-fit items-center gap-2 rounded bg-[#61dafb] px-4 py-2 font-semibold text-gray-900 disabled:opacity-50"
                >
                    <Plus size={16} />
                    {create.isPending ? "Creating…" : "Create coupon"}
                </button>
            </form>

            <ErrorBanner error={list.error ?? remove.error ?? toggle.error} />

            <Table
                headers={["Code", "Discount", "Expires", "Limit", "Enabled", ""]}
                empty={!list.data?.length}
            >
                {list.data?.map((coupon) => (
                    <tr key={coupon.id}>
                        <td className="px-4 py-3 font-mono">{coupon.code}</td>
                        <td className="px-4 py-3">
                            {describeDiscount(coupon)}
                        </td>
                        <td className="px-4 py-3 text-gray-500">
                            {coupon.expires_at
                                ? new Date(coupon.expires_at).toLocaleString()
                                : "never"}
                        </td>
                        <td className="px-4 py-3 text-gray-500">
                            {coupon.redeem_limit_store_enabled
                                ? coupon.redeem_limit_store_amount
                                : "unlimited"}
                        </td>
                        <td className="px-4 py-3">
                            <Toggle
                                label={coupon.enabled ? "On" : "Off"}
                                checked={coupon.enabled}
                                onChange={() => toggle.mutate(coupon)}
                            />
                        </td>
                        <td className="px-4 py-3">
                            <DeleteButton
                                onDelete={() => remove.mutate(coupon.id)}
                                pending={remove.isPending}
                            />
                        </td>
                    </tr>
                ))}
            </Table>
        </Panel>
    );
}
