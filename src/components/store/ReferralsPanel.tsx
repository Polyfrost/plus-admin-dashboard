import { useState } from "react";
import { Pencil, Plus, Save, X } from "lucide-react";
import { formatMinor, useAdminMutation, useAdminQuery } from "@/lib/store-api";
import {
    Badge,
    DeleteButton,
    ErrorBanner,
    Field,
    Panel,
    Table,
    Toggle,
    inputClass,
    primaryButton,
} from "./shared";

interface Referral {
    code: string;
    name: string;
    discount_id: number | null;
    enabled: boolean;
    created_at: string;
    orders: number;
    revenue_minor: number;
    clicks: number;
}

interface Coupon {
    id: number;
    name: string;
    code: string | null;
}

export function ReferralsPanel() {
    const referrals = useAdminQuery<Referral[]>("/v1/admin/referrals");
    const coupons = useAdminQuery<Coupon[]>("/v1/admin/discounts?kind=coupon");
    const [editing, setEditing] = useState<string | null>(null);

    const remove = useAdminMutation<string>((code) => ({
        method: "DELETE",
        path: `/v1/admin/referrals/${encodeURIComponent(code)}`,
    }));

    const couponName = (id: number | null) => {
        if (id === null) return "—";
        const coupon = coupons.data?.find((c) => c.id === id);
        return coupon ? `${coupon.name} (${coupon.code})` : `#${id}`;
    };

    return (
        <Panel
            title="Referrals"
            description="Creator codes buyers pass to checkout. A linked coupon applies by itself whenever the code is used. Point a tracked link (Links page) at a code to count its clicks here."
        >
            <ReferralForm coupons={coupons.data ?? []} />
            <ErrorBanner error={referrals.error ?? remove.error} />
            <Table
                headers={["Code", "Owner", "Coupon", "Orders", "Revenue", "Clicks", "Status", ""]}
                empty={!referrals.isPending && !referrals.data?.length}
            >
                {referrals.data?.map((referral) => {
                    const open = editing === referral.code;
                    return (
                        <ReferralRow
                            key={referral.code}
                            referral={referral}
                            coupon={couponName(referral.discount_id)}
                            coupons={coupons.data ?? []}
                            open={open}
                            onToggle={() => setEditing(open ? null : referral.code)}
                            pending={remove.isPending}
                            onDelete={() => {
                                if (
                                    confirm(
                                        `Delete the code ${referral.code}? Its orders keep the code, but tracked links pointing at it are unlinked. Disabling it is usually better.`,
                                    )
                                ) {
                                    remove.mutate(referral.code);
                                }
                            }}
                        />
                    );
                })}
            </Table>
        </Panel>
    );
}

function ReferralRow({
    referral,
    coupon,
    coupons,
    open,
    onToggle,
    pending,
    onDelete,
}: {
    referral: Referral;
    coupon: string;
    coupons: Coupon[];
    open: boolean;
    onToggle: () => void;
    pending: boolean;
    onDelete: () => void;
}) {
    return (
        <>
            <tr>
                <td className="px-4 py-3 font-mono">{referral.code}</td>
                <td className="px-4 py-3">{referral.name}</td>
                <td className="px-4 py-3 text-gray-400">{coupon}</td>
                <td className="px-4 py-3">{referral.orders}</td>
                <td className="px-4 py-3">{formatMinor(referral.revenue_minor, "USD")}</td>
                <td className="px-4 py-3">{referral.clicks}</td>
                <td className="px-4 py-3">
                    <Badge tone={referral.enabled ? "green" : "amber"}>
                        {referral.enabled ? "active" : "disabled"}
                    </Badge>
                </td>
                <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={onToggle}
                            title="Edit"
                            className="text-gray-400 hover:text-gray-100"
                        >
                            {open ? <X size={16} /> : <Pencil size={16} />}
                        </button>
                        <DeleteButton pending={pending} onDelete={onDelete} />
                    </div>
                </td>
            </tr>
            {open && (
                <tr>
                    <td colSpan={8} className="bg-gray-900/40 px-4 py-4">
                        <ReferralForm initial={referral} coupons={coupons} />
                    </td>
                </tr>
            )}
        </>
    );
}

/** Creates a code, or edits `initial`. The code itself can't change. */
function ReferralForm({
    initial,
    coupons,
}: {
    initial?: Referral;
    coupons: Coupon[];
}) {
    const [code, setCode] = useState(initial?.code ?? "");
    const [name, setName] = useState(initial?.name ?? "");
    const [discount, setDiscount] = useState(
        initial?.discount_id == null ? "" : String(initial.discount_id),
    );
    const [enabled, setEnabled] = useState(initial?.enabled ?? true);

    const save = useAdminMutation<void>(() => {
        const body = {
            name,
            discount_id: discount ? Number(discount) : null,
            enabled,
        };
        return initial
            ? {
                  method: "POST",
                  path: `/v1/admin/referrals/${encodeURIComponent(initial.code)}`,
                  body,
              }
            : { method: "POST", path: "/v1/admin/referrals", body: { ...body, code } };
    });

    return (
        <form
            onSubmit={(event) => {
                event.preventDefault();
                save.mutate(undefined, {
                    onSuccess: () => {
                        if (!initial) {
                            setCode("");
                            setName("");
                            setDiscount("");
                            setEnabled(true);
                        }
                    },
                });
            }}
            className={
                initial
                    ? "flex flex-col gap-3"
                    : "flex flex-col gap-3 rounded-lg bg-gray-800 p-4 shadow-xl"
            }
        >
            <div className="font-semibold text-gray-300">
                {initial ? `Edit ${initial.code}` : "Create a creator code"}
            </div>
            <div className="flex flex-wrap gap-3">
                {!initial && (
                    <Field label="Code" help="A-Z, 0-9, - and _; stored upper case">
                        <input
                            value={code}
                            onChange={(event) => setCode(event.target.value.toUpperCase())}
                            required
                            placeholder="LYNITH"
                            className={inputClass}
                        />
                    </Field>
                )}
                <Field label="Owner">
                    <input
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        required
                        placeholder="Creator name"
                        className={inputClass}
                    />
                </Field>
                <Field label="Coupon" help="Applied automatically with the code">
                    <select
                        value={discount}
                        onChange={(event) => setDiscount(event.target.value)}
                        className={inputClass}
                    >
                        <option value="">None</option>
                        {coupons.map((coupon) => (
                            <option key={coupon.id} value={coupon.id}>
                                {coupon.name} ({coupon.code})
                            </option>
                        ))}
                    </select>
                </Field>
            </div>
            <Toggle label="Active" checked={enabled} onChange={setEnabled} />
            <ErrorBanner error={save.error} />
            {initial && save.isSuccess && (
                <p className="text-sm text-green-300">Saved.</p>
            )}
            <button
                type="submit"
                disabled={!name.trim() || (!initial && !code.trim()) || save.isPending}
                className={primaryButton}
            >
                {initial ? <Save size={16} /> : <Plus size={16} />}
                {save.isPending ? "Saving…" : initial ? "Save code" : "Create code"}
            </button>
        </form>
    );
}
