import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search } from "lucide-react";
import {
    cosmeticUnits,
    formatMinor,
    useAdminQuery,
    useCatalog,
} from "@/lib/store-api";
import { Badge, ErrorBanner, Field, Panel, Table, inputClass, secondaryButton } from "./shared";

interface Player {
    uuid: string;
    username: string | null;
}

interface OrderLine {
    product_id: string;
    bundle_id: number | null;
    cosmetic_group_id: number | null;
    cosmetic_id: number | null;
    recipient: Player | null;
    quantity: number;
    price_minor: number;
    discount_minor: number;
    total_minor: number;
    currency: string;
    status: string;
    returned_minor: number;
}

interface Order {
    id: number;
    provider: string;
    provider_transaction_id: string | null;
    status: string;
    player: Player | null;
    buyer: Player | null;
    amount_minor: number | null;
    discount_minor: number | null;
    currency: string | null;
    refunded_minor: number;
    refunded_at: string | null;
    charged_back_at: string | null;
    created_at: string;
    lines: OrderLine[];
}

interface OrdersResponse {
    orders: Order[];
    total_items: number;
    total_pages: number;
}

const PAGE_SIZE = 50;

function PlayerName({ player }: { player: Player | null }) {
    if (!player) return <span className="text-gray-600">—</span>;
    return (
        <span title={player.uuid}>
            {player.username ?? (
                <span className="font-mono text-xs">{player.uuid}</span>
            )}
        </span>
    );
}

function StatusBadge({ order }: { order: Order }) {
    if (order.charged_back_at) return <Badge tone="red">charged back</Badge>;
    if (order.status === "refunded") return <Badge tone="red">refunded</Badge>;
    if (order.refunded_minor > 0) return <Badge tone="amber">part refunded</Badge>;
    if (order.status === "completed") return <Badge tone="green">completed</Badge>;
    if (order.status === "failed") return <Badge tone="red">failed</Badge>;
    return <Badge>{order.status}</Badge>;
}

export function OrdersPanel() {
    const [search, setSearch] = useState("");
    const [player, setPlayer] = useState("");
    const [page, setPage] = useState(1);
    const [open, setOpen] = useState<number | null>(null);

    const params = new URLSearchParams({
        page: String(page),
        nb: String(PAGE_SIZE),
    });
    if (player) params.set("player", player);
    const orders = useAdminQuery<OrdersResponse>(`/v1/admin/orders?${params}`);

    const catalog = useCatalog();
    const names = useMemo(() => {
        const map = new Map<string, string>();
        for (const unit of cosmeticUnits(catalog.data)) {
            if (unit.group_id !== null) map.set(`g${unit.group_id}`, unit.name);
            for (const variant of unit.variants) {
                map.set(`c${variant.id}`, variant.variant_name ?? unit.name);
            }
        }
        for (const bundle of catalog.data?.bundles ?? []) {
            map.set(`b${bundle.id}`, `${bundle.name} (bundle)`);
        }
        return map;
    }, [catalog.data]);
    const lineName = (line: OrderLine) =>
        (line.bundle_id != null && names.get(`b${line.bundle_id}`)) ||
        (line.cosmetic_group_id != null &&
            names.get(`g${line.cosmetic_group_id}`)) ||
        (line.cosmetic_id != null && names.get(`c${line.cosmetic_id}`)) ||
        line.product_id;

    return (
        <Panel
            title="Orders"
            description="Every transaction, newest first: PayNow purchases, admin grants and older Stripe ones. The player is who received it; the buyer only shows when someone else paid — a gift. Amounts are what was actually charged, after sales and coupons."
        >
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    setPage(1);
                    setPlayer(search.trim());
                }}
                className="flex flex-wrap items-end gap-3"
            >
                <Field label="Player" help="UUID or username, as buyer or recipient">
                    <input
                        value={search}
                        onChange={(event) => setSearch(event.target.value)}
                        placeholder="All players"
                        className={inputClass}
                    />
                </Field>
                <button type="submit" className={secondaryButton}>
                    <Search size={14} />
                    Filter
                </button>
            </form>

            <ErrorBanner error={orders.error} />
            {orders.isPending && (
                <p className="text-sm text-gray-500">Loading orders…</p>
            )}

            <Table
                headers={["", "Date", "Player", "Items", "Charged", "Status", "Via"]}
                empty={!orders.isPending && !orders.data?.orders.length}
            >
                {orders.data?.orders.map((order) => {
                    const expanded = open === order.id;
                    return (
                        <Fragment key={order.id}>
                            <tr
                                onClick={() => setOpen(expanded ? null : order.id)}
                                className="cursor-pointer hover:bg-gray-700/30"
                            >
                                <td className="pl-4 text-gray-500">
                                    {expanded ? (
                                        <ChevronDown size={14} />
                                    ) : (
                                        <ChevronRight size={14} />
                                    )}
                                </td>
                                <td className="px-4 py-3 text-gray-400">
                                    {new Date(order.created_at).toLocaleString()}
                                </td>
                                <td className="px-4 py-3">
                                    <PlayerName player={order.player} />
                                    {order.buyer && (
                                        <div className="text-xs text-gray-500">
                                            gift from{" "}
                                            <PlayerName player={order.buyer} />
                                        </div>
                                    )}
                                </td>
                                <td className="max-w-xs truncate px-4 py-3 text-gray-400">
                                    {order.lines.map(lineName).join(", ") || "—"}
                                </td>
                                <td className="px-4 py-3">
                                    {formatMinor(order.amount_minor, order.currency)}
                                    {!!order.discount_minor && (
                                        <div className="text-xs text-gray-500">
                                            −
                                            {formatMinor(
                                                order.discount_minor,
                                                order.currency,
                                            )}{" "}
                                            discount
                                        </div>
                                    )}
                                    {order.refunded_minor > 0 && (
                                        <div className="text-xs text-red-300">
                                            −
                                            {formatMinor(
                                                order.refunded_minor,
                                                order.currency,
                                            )}{" "}
                                            refunded
                                        </div>
                                    )}
                                </td>
                                <td className="px-4 py-3">
                                    <StatusBadge order={order} />
                                </td>
                                <td className="px-4 py-3 text-gray-500">
                                    {order.provider.replace("_", " ")}
                                </td>
                            </tr>
                            {expanded && (
                                <tr>
                                    <td colSpan={7} className="bg-gray-900/40 px-4 py-3">
                                        <OrderDetails order={order} lineName={lineName} />
                                    </td>
                                </tr>
                            )}
                        </Fragment>
                    );
                })}
            </Table>

            {orders.data && orders.data.total_pages > 1 && (
                <div className="flex items-center gap-3 text-sm text-gray-400">
                    <button
                        onClick={() => setPage(page - 1)}
                        disabled={page <= 1}
                        className={secondaryButton}
                    >
                        Previous
                    </button>
                    Page {page} of {orders.data.total_pages} ·{" "}
                    {orders.data.total_items} orders
                    <button
                        onClick={() => setPage(page + 1)}
                        disabled={page >= orders.data.total_pages}
                        className={secondaryButton}
                    >
                        Next
                    </button>
                </div>
            )}
        </Panel>
    );
}

function OrderDetails({
    order,
    lineName,
}: {
    order: Order;
    lineName: (line: OrderLine) => string;
}) {
    return (
        <div className="flex flex-col gap-3 text-sm">
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-gray-500">
                <span>Order #{order.id}</span>
                {order.provider_transaction_id && (
                    <span className="font-mono">
                        {order.provider}: {order.provider_transaction_id}
                    </span>
                )}
                {order.player && (
                    <span className="font-mono">player {order.player.uuid}</span>
                )}
                {order.refunded_at && (
                    <span>
                        refunded {new Date(order.refunded_at).toLocaleString()}
                    </span>
                )}
                {order.charged_back_at && (
                    <span className="text-red-300">
                        charged back{" "}
                        {new Date(order.charged_back_at).toLocaleString()}
                    </span>
                )}
            </div>
            {order.lines.length ? (
                <table className="w-full text-left">
                    <thead className="text-xs uppercase text-gray-500">
                        <tr>
                            <th className="py-1 pr-4">Item</th>
                            <th className="py-1 pr-4">For</th>
                            <th className="py-1 pr-4">Qty</th>
                            <th className="py-1 pr-4">Price</th>
                            <th className="py-1 pr-4">Discount</th>
                            <th className="py-1 pr-4">Total</th>
                            <th className="py-1 pr-4">Status</th>
                        </tr>
                    </thead>
                    <tbody className="text-gray-300">
                        {order.lines.map((line, index) => (
                            <tr key={index}>
                                <td className="py-1 pr-4">{lineName(line)}</td>
                                <td className="py-1 pr-4">
                                    <PlayerName player={line.recipient ?? order.player} />
                                </td>
                                <td className="py-1 pr-4">{line.quantity}</td>
                                <td className="py-1 pr-4">
                                    {formatMinor(line.price_minor, line.currency)}
                                </td>
                                <td className="py-1 pr-4">
                                    {line.discount_minor
                                        ? `−${formatMinor(line.discount_minor, line.currency)}`
                                        : "—"}
                                </td>
                                <td className="py-1 pr-4">
                                    {formatMinor(line.total_minor, line.currency)}
                                </td>
                                <td className="py-1 pr-4">
                                    {line.status}
                                    {line.returned_minor > 0 &&
                                        ` (−${formatMinor(line.returned_minor, line.currency)})`}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            ) : (
                <p className="text-gray-500">
                    No line items recorded — an older or granted order.
                </p>
            )}
        </div>
    );
}
