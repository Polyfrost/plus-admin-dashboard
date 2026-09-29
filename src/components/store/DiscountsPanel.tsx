import { useMemo, useState } from "react";
import { Pencil, Plus, Save, X } from "lucide-react";
import {
    cosmeticUnits,
    formatMinor,
    useAdminMutation,
    useAdminQuery,
    useCatalog,
    useCollections,
    useTags,
} from "@/lib/store-api";
import {
    Badge,
    CheckList,
    DeleteButton,
    ErrorBanner,
    Field,
    Panel,
    PayloadPreview,
    Table,
    Toggle,
    fromLocalInput,
    inputClass,
    optionalNumber,
    primaryButton,
    secondaryButton,
    toLocalInput,
    type CheckItem,
} from "./shared";

interface Targets {
    collections: number[];
    tags: number[];
    cosmetics: number[];
    cosmetic_groups: number[];
    bundles: number[];
}

interface Discount {
    id: number;
    name: string;
    description: string | null;
    code: string | null;
    percent_off: number | null;
    amount_off_minor: number | null;
    currency: string | null;
    starts_at: string | null;
    ends_at: string | null;
    enabled: boolean;
    applies_to_all: boolean;
    targets: Targets;
    min_subtotal_minor: number | null;
    max_redemptions: number | null;
    max_per_player: number | null;
    redemptions: number;
    paynow_id: string | null;
    created_at: string;
}

type Kind = "sale" | "coupon";

/** The write body is the view minus what the backend owns. */
function toBody(discount: Discount) {
    const {
        id: _id,
        redemptions: _redemptions,
        paynow_id: _paynow,
        created_at: _created,
        ...body
    } = discount;
    return body;
}

function describe(discount: Discount) {
    return discount.percent_off != null
        ? `${discount.percent_off}% off`
        : `${formatMinor(discount.amount_off_minor, discount.currency)} off`;
}

/** Targets are stored per kind; the picker shows products as one list. */
function useTargetItems() {
    const catalog = useCatalog();
    const tags = useTags();
    const collections = useCollections();
    const units = useMemo(() => cosmeticUnits(catalog.data), [catalog.data]);

    const products: CheckItem<string>[] = [
        ...(catalog.data?.bundles ?? []).map((bundle) => ({
            id: `b${bundle.id}`,
            label: bundle.name,
            hint: "bundle",
        })),
        ...units.map((unit) => ({
            id: unit.key,
            label: unit.name,
            hint: unit.store_product_id ? unit.type : `${unit.type} · not sold`,
        })),
    ];

    return {
        products,
        tags: (tags.data?.tags ?? []).map((tag) => ({
            id: tag.id,
            label: tag.display_name ?? tag.name,
            hint: tag.tag_type,
        })),
        collections: (collections.data?.collections ?? []).map((c) => ({
            id: c.id,
            label: c.name,
        })),
        error: catalog.error ?? tags.error ?? collections.error,
        nameOf: (targets: Targets) => {
            const productNames = new Map(products.map((i) => [i.id, i.label]));
            const tagNames = new Map(
                (tags.data?.tags ?? []).map((t) => [t.id, t.name]),
            );
            const collectionNames = new Map(
                (collections.data?.collections ?? []).map((c) => [c.id, c.name]),
            );
            return [
                ...targets.bundles.map((id) => productNames.get(`b${id}`) ?? `bundle ${id}`),
                ...targets.cosmetic_groups.map(
                    (id) => productNames.get(`g${id}`) ?? `group ${id}`,
                ),
                ...targets.cosmetics.map(
                    (id) => productNames.get(`c${id}`) ?? `cosmetic ${id}`,
                ),
                ...targets.tags.map((id) => `#${tagNames.get(id) ?? id}`),
                ...targets.collections.map(
                    (id) => `${collectionNames.get(id) ?? id} (collection)`,
                ),
            ].join(", ");
        },
    };
}

export function DiscountsPanel({ kind }: { kind: Kind }) {
    const list = useAdminQuery<Discount[]>(`/v1/admin/discounts?kind=${kind}`);
    const items = useTargetItems();
    const [editing, setEditing] = useState<number | null>(null);

    const toggle = useAdminMutation<Discount>((discount) => ({
        method: "POST",
        path: `/v1/admin/discounts/${discount.id}`,
        body: { ...toBody(discount), enabled: !discount.enabled },
    }));
    const remove = useAdminMutation<number>((id) => ({
        method: "DELETE",
        path: `/v1/admin/discounts/${id}`,
    }));

    return (
        <Panel
            title={kind === "sale" ? "Sales" : "Coupons"}
            description={
                kind === "sale"
                    ? "Run on their own and show on the storefront as a struck-through price. Each item gets its best sale. Also created on PayNow, so its checkout charges the same."
                    : "Only apply when the buyer types the code, on top of any sale. Also created on PayNow. Products with coupons disabled in their listing rules ignore them."
            }
        >
            <DiscountForm kind={kind} items={items} />

            <ErrorBanner
                error={list.error ?? items.error ?? toggle.error ?? remove.error}
            />

            <Table
                headers={[
                    "Name",
                    ...(kind === "coupon" ? ["Code"] : []),
                    "Discount",
                    "Applies to",
                    "Runs",
                    "Used",
                    "Enabled",
                    "",
                ]}
                empty={!list.isPending && !list.data?.length}
            >
                {list.data?.map((discount) => (
                    <DiscountRow
                        key={discount.id}
                        discount={discount}
                        kind={kind}
                        items={items}
                        open={editing === discount.id}
                        onEdit={() =>
                            setEditing(
                                editing === discount.id ? null : discount.id,
                            )
                        }
                        onToggle={() => toggle.mutate(discount)}
                        onDelete={() => {
                            if (
                                confirm(
                                    `Delete "${discount.name}"? Its redemption history goes with it — disabling keeps it.`,
                                )
                            ) {
                                remove.mutate(discount.id);
                            }
                        }}
                        pending={toggle.isPending || remove.isPending}
                    />
                ))}
            </Table>
        </Panel>
    );
}

function DiscountRow({
    discount,
    kind,
    items,
    open,
    onEdit,
    onToggle,
    onDelete,
    pending,
}: {
    discount: Discount;
    kind: Kind;
    items: ReturnType<typeof useTargetItems>;
    open: boolean;
    onEdit: () => void;
    onToggle: () => void;
    onDelete: () => void;
    pending: boolean;
}) {
    const cols = kind === "coupon" ? 8 : 7;
    const scope = discount.applies_to_all
        ? "Everything"
        : items.nameOf(discount.targets) || "—";

    return (
        <>
            <tr>
                <td className="px-4 py-3">
                    {discount.name}
                    {!discount.paynow_id && (
                        <span className="ml-2" title="Saved here, not yet on PayNow. provision-paynow --sync-discounts repairs it.">
                            <Badge tone="amber">not on PayNow</Badge>
                        </span>
                    )}
                </td>
                {kind === "coupon" && (
                    <td className="px-4 py-3 font-mono">{discount.code}</td>
                )}
                <td className="px-4 py-3">
                    {describe(discount)}
                    {discount.min_subtotal_minor != null && (
                        <div className="text-xs text-gray-500">
                            over{" "}
                            {formatMinor(
                                discount.min_subtotal_minor,
                                discount.currency,
                            )}
                        </div>
                    )}
                </td>
                <td className="max-w-xs truncate px-4 py-3 text-gray-400" title={scope}>
                    {scope}
                </td>
                <td className="px-4 py-3 text-xs text-gray-500">
                    {discount.starts_at
                        ? new Date(discount.starts_at).toLocaleString()
                        : "now"}
                    {" → "}
                    {discount.ends_at
                        ? new Date(discount.ends_at).toLocaleString()
                        : "no end"}
                </td>
                <td className="px-4 py-3 text-gray-400">
                    {discount.redemptions}
                    {discount.max_redemptions != null &&
                        ` / ${discount.max_redemptions}`}
                </td>
                <td className="px-4 py-3">
                    <Toggle
                        label={discount.enabled ? "On" : "Off"}
                        checked={discount.enabled}
                        onChange={onToggle}
                    />
                </td>
                <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                        <button
                            onClick={onEdit}
                            title="Edit"
                            className="text-gray-400 hover:text-gray-100"
                        >
                            {open ? <X size={16} /> : <Pencil size={16} />}
                        </button>
                        <DeleteButton onDelete={onDelete} pending={pending} />
                    </div>
                </td>
            </tr>
            {open && (
                <tr>
                    <td colSpan={cols} className="bg-gray-900/40 px-4 py-4">
                        <DiscountForm
                            kind={kind}
                            items={items}
                            initial={discount}
                        />
                    </td>
                </tr>
            )}
        </>
    );
}

function DiscountForm({
    kind,
    items,
    initial,
}: {
    kind: Kind;
    items: ReturnType<typeof useTargetItems>;
    initial?: Discount;
}) {
    const [name, setName] = useState(initial?.name ?? "");
    const [description, setDescription] = useState(initial?.description ?? "");
    const [code, setCode] = useState(initial?.code ?? "");
    const [fixed, setFixed] = useState(initial?.amount_off_minor != null);
    const [percent, setPercent] = useState(String(initial?.percent_off ?? 10));
    // Typed in major units; stored in minor.
    const [amount, setAmount] = useState(
        initial?.amount_off_minor != null
            ? String(initial.amount_off_minor / 100)
            : "",
    );
    const [currency, setCurrency] = useState(initial?.currency ?? "usd");
    const [startsAt, setStartsAt] = useState(toLocalInput(initial?.starts_at));
    const [endsAt, setEndsAt] = useState(toLocalInput(initial?.ends_at));
    const [enabled, setEnabled] = useState(initial?.enabled ?? true);
    const [all, setAll] = useState(initial?.applies_to_all ?? false);
    const [products, setProducts] = useState<string[]>(
        initial
            ? [
                  ...initial.targets.bundles.map((id) => `b${id}`),
                  ...initial.targets.cosmetic_groups.map((id) => `g${id}`),
                  ...initial.targets.cosmetics.map((id) => `c${id}`),
              ]
            : [],
    );
    const [tags, setTags] = useState<number[]>(initial?.targets.tags ?? []);
    const [collections, setCollections] = useState<number[]>(
        initial?.targets.collections ?? [],
    );
    const [minSubtotal, setMinSubtotal] = useState(
        initial?.min_subtotal_minor != null
            ? String(initial.min_subtotal_minor / 100)
            : "",
    );
    const [maxRedemptions, setMaxRedemptions] = useState(
        initial?.max_redemptions != null ? String(initial.max_redemptions) : "",
    );
    const [maxPerPlayer, setMaxPerPlayer] = useState(
        initial?.max_per_player != null ? String(initial.max_per_player) : "",
    );

    const ids = (prefix: string) =>
        products
            .filter((key) => key.startsWith(prefix))
            .map((key) => Number(key.slice(1)));
    const toMinor = (value: string) =>
        value.trim() === "" ? null : Math.round(Number(value) * 100);

    const body = {
        name,
        description: description.trim() || null,
        code: kind === "coupon" ? code.trim() : null,
        percent_off: fixed ? null : Number(percent),
        amount_off_minor: fixed ? toMinor(amount) : null,
        currency: fixed ? currency : null,
        starts_at: fromLocalInput(startsAt),
        ends_at: fromLocalInput(endsAt),
        enabled,
        applies_to_all: all,
        targets: {
            collections: all ? [] : collections,
            tags: all ? [] : tags,
            cosmetics: all ? [] : ids("c"),
            cosmetic_groups: all ? [] : ids("g"),
            bundles: all ? [] : ids("b"),
        },
        min_subtotal_minor: toMinor(minSubtotal),
        max_redemptions: optionalNumber(maxRedemptions),
        max_per_player: optionalNumber(maxPerPlayer),
    };
    const hasTargets =
        all || products.length > 0 || tags.length > 0 || collections.length > 0;

    const save = useAdminMutation<void>(() =>
        initial
            ? {
                  method: "POST",
                  path: `/v1/admin/discounts/${initial.id}`,
                  body,
              }
            : { method: "POST", path: "/v1/admin/discounts", body },
    );

    const reset = () => {
        setName("");
        setDescription("");
        setCode("");
        setProducts([]);
        setTags([]);
        setCollections([]);
    };

    return (
        <form
            onSubmit={(event) => {
                event.preventDefault();
                save.mutate(undefined, { onSuccess: initial ? undefined : reset });
            }}
            className={
                initial
                    ? "flex flex-col gap-3"
                    : "flex flex-col gap-3 rounded-lg bg-gray-800 p-4 shadow-xl"
            }
        >
            <div className="font-semibold text-gray-300">
                {initial ? `Edit ${initial.name}` : `Create a ${kind}`}
            </div>
            <div className="flex flex-wrap gap-3">
                <Field label="Name">
                    <input
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        required
                        placeholder={kind === "sale" ? "Summer sale" : "Creator code"}
                        className={inputClass}
                    />
                </Field>
                {kind === "coupon" && (
                    <Field label="Code" help="Matched case-insensitively">
                        <input
                            value={code}
                            onChange={(event) =>
                                setCode(event.target.value.toUpperCase())
                            }
                            required
                            placeholder="SUMMER25"
                            className={`${inputClass} font-mono`}
                        />
                    </Field>
                )}
                <Field label="Type">
                    <select
                        value={fixed ? "fixed" : "percent"}
                        onChange={(event) =>
                            setFixed(event.target.value === "fixed")
                        }
                        className={inputClass}
                    >
                        <option value="percent">Percent off</option>
                        <option value="fixed">Fixed amount off</option>
                    </select>
                </Field>
                {fixed ? (
                    <>
                        <Field label="Amount off" help="In major units — 2.50">
                            <input
                                type="number"
                                min="0.01"
                                step="0.01"
                                value={amount}
                                onChange={(event) => setAmount(event.target.value)}
                                required
                                className={inputClass}
                            />
                        </Field>
                        <Field
                            label="Currency"
                            help="Only lines priced in it are discounted"
                        >
                            <input
                                value={currency}
                                onChange={(event) =>
                                    setCurrency(event.target.value.toLowerCase())
                                }
                                required
                                className={inputClass}
                            />
                        </Field>
                    </>
                ) : (
                    <Field label="Percent off" help="1–100">
                        <input
                            type="number"
                            min="1"
                            max="100"
                            step="1"
                            value={percent}
                            onChange={(event) => setPercent(event.target.value)}
                            required
                            className={inputClass}
                        />
                    </Field>
                )}
            </div>
            <Field label="Description">
                <input
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    className={inputClass}
                />
            </Field>
            <div className="flex flex-wrap gap-3">
                <Field label="Starts" help="Empty starts now">
                    <input
                        type="datetime-local"
                        value={startsAt}
                        onChange={(event) => setStartsAt(event.target.value)}
                        className={inputClass}
                    />
                </Field>
                <Field label="Ends" help="Empty runs until removed">
                    <input
                        type="datetime-local"
                        value={endsAt}
                        onChange={(event) => setEndsAt(event.target.value)}
                        className={inputClass}
                    />
                </Field>
                <Field label="Minimum basket" help="Before discounts, e.g. 20.00; empty for none">
                    <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={minSubtotal}
                        onChange={(event) => setMinSubtotal(event.target.value)}
                        className={inputClass}
                    />
                </Field>
                <Field label="Max uses" help="Across everyone">
                    <input
                        type="number"
                        min="1"
                        value={maxRedemptions}
                        onChange={(event) =>
                            setMaxRedemptions(event.target.value)
                        }
                        className={inputClass}
                    />
                </Field>
                <Field label="Max per player">
                    <input
                        type="number"
                        min="1"
                        value={maxPerPlayer}
                        onChange={(event) => setMaxPerPlayer(event.target.value)}
                        className={inputClass}
                    />
                </Field>
            </div>

            <Toggle
                label="Applies to the whole store"
                checked={all}
                onChange={setAll}
            />
            {!all && (
                <div className="grid gap-3 md:grid-cols-3">
                    <Field label="Products">
                        <CheckList
                            items={items.products}
                            selected={products}
                            onChange={setProducts}
                        />
                    </Field>
                    <Field label="Tags">
                        <CheckList
                            items={items.tags}
                            selected={tags}
                            onChange={setTags}
                            empty="No tags yet."
                        />
                    </Field>
                    <Field label="Collections">
                        <CheckList
                            items={items.collections}
                            selected={collections}
                            onChange={setCollections}
                            empty="No collections yet."
                        />
                    </Field>
                </div>
            )}
            <Toggle label="Enabled" checked={enabled} onChange={setEnabled} />
            <PayloadPreview body={body} />
            <ErrorBanner error={save.error} />
            {save.isSuccess && initial && (
                <p className="text-sm text-green-300">Saved.</p>
            )}
            <button
                type="submit"
                disabled={!name.trim() || !hasTargets || save.isPending}
                className={initial ? secondaryButton : primaryButton}
            >
                {initial ? <Save size={16} /> : <Plus size={16} />}
                {save.isPending
                    ? "Saving…"
                    : initial
                      ? "Save changes"
                      : `Create ${kind}`}
            </button>
        </form>
    );
}
