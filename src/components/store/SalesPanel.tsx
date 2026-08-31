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

interface Sale {
    id: string;
    name: string;
    enabled: boolean;
    discount_type: "percent" | "amount";
    discount_amount: number;
    begins_at: string;
    ends_at: string | null;
}

/**
 * PayNow validates this to 1–120 even when `duration` is "once", where there is
 * no interval to repeat over, so it is pinned to the low end of the range.
 */
const DURATION_IN_INTERVALS = 1;

function localNow(): string {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    return now.toISOString().slice(0, 16);
}

export function SalesPanel() {
    const list = useStoreList<Sale[]>("sales");
    const [name, setName] = useState("");
    const [type, setType] = useState<"percent" | "amount">("percent");
    const [amount, setAmount] = useState("10");
    const [beginsAt, setBeginsAt] = useState(localNow);
    const [endsAt, setEndsAt] = useState("");
    const [enabled, setEnabled] = useState(true);

    const body = {
        enabled,
        name,
        discount_type: type,
        discount_amount: toDiscountAmount(type, amount),
        duration: "once",
        duration_in_intervals: DURATION_IN_INTERVALS,
        apply_to_product_ids: [],
        apply_to_tag_ids: [],
        minimum_order_value: 0,
        begins_at: new Date(beginsAt || Date.now()).toISOString(),
        ends_at: endsAt ? new Date(endsAt).toISOString() : null,
    };

    const create = useStoreMutation<void>("sales", () => ({
        method: "POST",
        path: "",
        body,
    }));
    const remove = useStoreMutation<string>("sales", (id) => ({
        method: "DELETE",
        path: `/${id}`,
    }));
    const toggle = useStoreMutation<Sale>("sales", (sale) => ({
        method: "PATCH",
        path: `/${sale.id}`,
        body: { enabled: !sale.enabled },
    }));

    return (
        <Panel
            title="Sales"
            description="Scheduled discounts. A sale with an end date starts and stops itself, which is the thing the cosmetic and bundle price fields cannot do — those change the price until someone changes it back. Leaving both product and tag lists empty applies the sale store-wide."
        >
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    create.mutate();
                }}
                className="flex flex-col gap-3 rounded-lg bg-gray-800 p-4 shadow-xl"
            >
                <div className="font-semibold text-gray-300">Create a sale</div>
                <div className="flex flex-wrap gap-3">
                    <Field label="Name">
                        <input
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            required
                            placeholder="Summer sale"
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
                    <Field label="Begins">
                        <input
                            type="datetime-local"
                            value={beginsAt}
                            onChange={(event) => setBeginsAt(event.target.value)}
                            required
                            className={inputClass}
                        />
                    </Field>
                    <Field label="Ends" help="Leave empty to run until removed">
                        <input
                            type="datetime-local"
                            value={endsAt}
                            onChange={(event) => setEndsAt(event.target.value)}
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
                    disabled={!name || create.isPending}
                    className="flex w-fit items-center gap-2 rounded bg-[#61dafb] px-4 py-2 font-semibold text-gray-900 disabled:opacity-50"
                >
                    <Plus size={16} />
                    {create.isPending ? "Creating…" : "Create sale"}
                </button>
            </form>

            <ErrorBanner error={list.error ?? remove.error ?? toggle.error} />

            <Table
                headers={["Name", "Discount", "Runs", "Enabled", ""]}
                empty={!list.data?.length}
            >
                {list.data?.map((sale) => (
                    <tr key={sale.id}>
                        <td className="px-4 py-3">{sale.name}</td>
                        <td className="px-4 py-3">{describeDiscount(sale)}</td>
                        <td className="px-4 py-3 text-gray-500">
                            {new Date(sale.begins_at).toLocaleString()}
                            {sale.ends_at
                                ? ` → ${new Date(sale.ends_at).toLocaleString()}`
                                : " → no end"}
                        </td>
                        <td className="px-4 py-3">
                            <Toggle
                                label={sale.enabled ? "On" : "Off"}
                                checked={sale.enabled}
                                onChange={() => toggle.mutate(sale)}
                            />
                        </td>
                        <td className="px-4 py-3">
                            <DeleteButton
                                onDelete={() => remove.mutate(sale.id)}
                                pending={remove.isPending}
                            />
                        </td>
                    </tr>
                ))}
            </Table>
        </Panel>
    );
}
