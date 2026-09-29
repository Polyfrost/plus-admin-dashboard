import { useMemo, useState } from "react";
import { Pencil, Plus, Save, X } from "lucide-react";
import {
    cosmeticUnits,
    formatPrice,
    useAdminMutation,
    useAdminQuery,
    useCatalog,
    useCollections,
    type CatalogBundle,
    type Collection,
    type CosmeticUnit,
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
} from "./shared";

/** One row of the product list: a bundle, or a cosmetic unit sold on its own. */
type Product =
    | { kind: "bundles"; id: number; bundle: CatalogBundle }
    | { kind: "cosmetics"; id: number; unit: CosmeticUnit };

function productName(product: Product) {
    return product.kind === "bundles" ? product.bundle.name : product.unit.name;
}

function unitHint(unit: CosmeticUnit) {
    const variants =
        unit.variants.length > 1 ? ` · ${unit.variants.length} variants` : "";
    const sold = unit.store_product_id ? ` · sold ${formatPrice(unit.base_price)}` : "";
    return `${unit.type}${variants}${sold}`;
}

export function ProductsPanel() {
    const catalog = useCatalog();
    const collections = useCollections();
    const units = useMemo(() => cosmeticUnits(catalog.data), [catalog.data]);
    const [editing, setEditing] = useState<string | null>(null);
    const [preselect, setPreselect] = useState<string[]>([]);

    const products: Product[] = [
        ...(catalog.data?.bundles ?? []).map(
            (bundle): Product => ({ kind: "bundles", id: bundle.id, bundle }),
        ),
        ...units
            .filter((unit) => unit.store_product_id)
            .map(
                (unit): Product => ({
                    kind: "cosmetics",
                    id: unit.first.id,
                    unit,
                }),
            ),
    ].sort((a, b) => productName(a).localeCompare(productName(b)));
    const unsold = units.filter((unit) => !unit.store_product_id);

    return (
        <Panel
            title="Products"
            description="What the store sells. A product is either one cosmetic (a variant group sells as one) or a bundle of several. Uploading a cosmetic never makes it a product — pick it here and give it a price. Discounts live under Sales and Coupons, not here."
        >
            <CreateProduct
                key={preselect.join()}
                units={units}
                collections={collections.data?.collections ?? []}
                preselect={preselect}
            />

            <ErrorBanner error={catalog.error} />
            {catalog.isPending && (
                <p className="text-sm text-gray-500">Loading the catalogue…</p>
            )}

            <Table
                headers={["Product", "Contents", "Price", "Status", ""]}
                empty={!catalog.isPending && !products.length}
            >
                {products.map((product) => {
                    const key = `${product.kind}-${product.id}`;
                    return (
                        <ProductRow
                            key={key}
                            product={product}
                            units={units}
                            collections={collections.data?.collections ?? []}
                            open={editing === key}
                            onToggle={() =>
                                setEditing(editing === key ? null : key)
                            }
                        />
                    );
                })}
            </Table>

            <div>
                <h3 className="font-semibold text-gray-300">
                    Uploaded, not for sale ({unsold.length})
                </h3>
                <p className="mb-2 text-sm text-gray-500">
                    These can still be granted or put in a bundle. Sell one on
                    its own to give it a product.
                </p>
                <Table
                    headers={["Cosmetic", "Type", "Variants", ""]}
                    empty={!unsold.length}
                >
                    {unsold.map((unit) => (
                        <tr key={unit.key}>
                            <td className="px-4 py-2">
                                {unit.name}
                                {!unit.enabled && (
                                    <span className="ml-2">
                                        <Badge>disabled</Badge>
                                    </span>
                                )}
                            </td>
                            <td className="px-4 py-2 text-gray-500">
                                {unit.type}
                            </td>
                            <td className="px-4 py-2 text-gray-500">
                                {unit.variants.length}
                            </td>
                            <td className="px-4 py-2">
                                <button
                                    onClick={() => {
                                        setPreselect([unit.key]);
                                        window.scrollTo({
                                            top: 0,
                                            behavior: "smooth",
                                        });
                                    }}
                                    className={secondaryButton}
                                >
                                    Sell
                                </button>
                            </td>
                        </tr>
                    ))}
                </Table>
            </div>
        </Panel>
    );
}

function CollectionSelect({
    collections,
    value,
    onChange,
}: {
    collections: Collection[];
    value: string;
    onChange: (next: string) => void;
}) {
    return (
        <select
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className={inputClass}
        >
            <option value="">No collection</option>
            {collections.map((collection) => (
                <option key={collection.id} value={collection.id}>
                    {collection.name}
                </option>
            ))}
        </select>
    );
}

function CreateProduct({
    units,
    collections,
    preselect,
}: {
    units: CosmeticUnit[];
    collections: Collection[];
    preselect: string[];
}) {
    const [selected, setSelected] = useState(preselect);
    const [asBundle, setAsBundle] = useState(false);
    const [name, setName] = useState("");
    const [description, setDescription] = useState("");
    const [price, setPrice] = useState("");
    const [collection, setCollection] = useState("");
    const [cover, setCover] = useState<File | null>(null);

    const picked = units.filter((unit) => selected.includes(unit.key));
    const bundle = asBundle || picked.length > 1;
    const single = !bundle ? picked[0] : undefined;
    const alreadySold = single?.store_product_id;

    const body = bundle
        ? {
              name,
              description: description || undefined,
              base_price: Number(price),
              collection: collection ? Number(collection) : undefined,
              cosmetic_id: picked.flatMap((unit) =>
                  unit.variants.map((variant) => variant.id),
              ),
              file: cover?.name,
          }
        : {
              cosmetic_id: single?.first.id,
              new_price: Number(price),
              name: name.trim() || undefined,
              description: description.trim() || undefined,
              collection: collection ? Number(collection) : undefined,
          };

    const create = useAdminMutation<void>(() => {
        if (!bundle) {
            return { method: "POST", path: "/cosmetics/manage/update", body };
        }
        const form = new FormData();
        form.append("name", name);
        if (description.trim()) form.append("description", description);
        form.append("base_price", price);
        if (collection) form.append("collection", collection);
        if (cover) form.append("file", cover, cover.name);
        for (const unit of picked) {
            for (const variant of unit.variants) {
                form.append("cosmetic_id", String(variant.id));
            }
        }
        return { method: "POST", path: "/bundles/manage/create", body: form };
    });

    const reset = () => {
        setSelected([]);
        setAsBundle(false);
        setName("");
        setDescription("");
        setPrice("");
        setCollection("");
        setCover(null);
    };

    const ready =
        picked.length > 0 &&
        Number(price) > 0 &&
        (bundle ? name.trim() !== "" : !alreadySold);

    return (
        <form
            onSubmit={(event) => {
                event.preventDefault();
                create.mutate(undefined, { onSuccess: reset });
            }}
            className="flex flex-col gap-3 rounded-lg bg-gray-800 p-4 shadow-xl"
        >
            <div className="font-semibold text-gray-300">Create a product</div>
            <Field
                label="Cosmetics"
                help="One cosmetic sells on its own; two or more make a bundle. Picking a group includes every variant."
            >
                <CheckList
                    items={units.map((unit) => ({
                        id: unit.key,
                        label: unit.name,
                        hint: unitHint(unit),
                    }))}
                    selected={selected}
                    onChange={setSelected}
                    empty="No cosmetics uploaded yet."
                />
            </Field>
            {picked.length === 1 && (
                <Toggle
                    label="Sell it as a bundle instead (its own name, cover and price, separate from the cosmetic)"
                    checked={asBundle}
                    onChange={setAsBundle}
                />
            )}
            {alreadySold && (
                <p className="text-sm text-amber-300">
                    {single?.name} is already a product at{" "}
                    {formatPrice(single?.base_price)}. Edit it in the list
                    below, or sell it as a bundle.
                </p>
            )}
            <div className="flex flex-wrap gap-3">
                <Field
                    label={bundle ? "Bundle name" : "Name"}
                    help={
                        bundle
                            ? undefined
                            : "Leave empty to keep the cosmetic's name. Changing it renames the cosmetic."
                    }
                >
                    <input
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        required={bundle}
                        placeholder={single?.name ?? "Winter bundle"}
                        className={inputClass}
                    />
                </Field>
                <Field label="Price (USD)">
                    <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={price}
                        onChange={(event) => setPrice(event.target.value)}
                        required
                        placeholder="4.99"
                        className={inputClass}
                    />
                </Field>
                <Field label="Collection">
                    <CollectionSelect
                        collections={collections}
                        value={collection}
                        onChange={setCollection}
                    />
                </Field>
            </div>
            <Field label="Description">
                <textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    rows={2}
                    className={inputClass}
                />
            </Field>
            {bundle && (
                <Field label="Cover image" help="Optional">
                    <input
                        type="file"
                        accept="image/*"
                        onChange={(event) =>
                            setCover(event.target.files?.[0] ?? null)
                        }
                        className={inputClass}
                    />
                </Field>
            )}
            <PayloadPreview body={body} />
            <ErrorBanner error={create.error} />
            <button
                type="submit"
                disabled={!ready || create.isPending}
                className={primaryButton}
            >
                <Plus size={16} />
                {create.isPending
                    ? "Creating…"
                    : bundle
                      ? "Create bundle"
                      : "Sell cosmetic"}
            </button>
        </form>
    );
}

function ProductRow({
    product,
    units,
    collections,
    open,
    onToggle,
}: {
    product: Product;
    units: CosmeticUnit[];
    collections: Collection[];
    open: boolean;
    onToggle: () => void;
}) {
    const remove = useAdminMutation<number>((id) => ({
        method: "POST",
        path: "/bundles/manage/delete",
        body: { bundle_id: id },
    }));

    const enabled =
        product.kind === "bundles" ? product.bundle.enabled : product.unit.enabled;
    const price =
        product.kind === "bundles"
            ? product.bundle.base_price
            : product.unit.base_price;

    let contents: string;
    if (product.kind === "bundles") {
        const ids = new Set(product.bundle.cosmetic_ids);
        contents =
            units
                .filter((unit) => unit.variants.some((v) => ids.has(v.id)))
                .map((unit) => unit.name)
                .join(", ") || "Empty";
    } else {
        contents =
            product.unit.variants.length > 1
                ? `${product.unit.variants.length} variants`
                : product.unit.type;
    }

    return (
        <>
            <tr>
                <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                        {productName(product)}
                        <Badge tone={product.kind === "bundles" ? "blue" : "gray"}>
                            {product.kind === "bundles" ? "bundle" : "cosmetic"}
                        </Badge>
                    </div>
                </td>
                <td className="max-w-xs truncate px-4 py-3 text-gray-500" title={contents}>
                    {contents}
                </td>
                <td className="px-4 py-3">{formatPrice(price)}</td>
                <td className="px-4 py-3">
                    <Badge tone={enabled ? "green" : "amber"}>
                        {enabled ? "on sale" : "hidden"}
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
                        {product.kind === "bundles" && (
                            <DeleteButton
                                pending={remove.isPending}
                                onDelete={() => {
                                    if (
                                        confirm(
                                            `Delete the bundle "${product.bundle.name}"? Players who bought it keep its cosmetics.`,
                                        )
                                    ) {
                                        remove.mutate(product.id);
                                    }
                                }}
                            />
                        )}
                    </div>
                </td>
            </tr>
            {(open || remove.error) && (
                <tr>
                    <td colSpan={5} className="bg-gray-900/40 px-4 py-4">
                        <ErrorBanner error={remove.error} />
                        {open && (
                            <div className="flex flex-col gap-6">
                                <ProductDetails
                                    product={product}
                                    units={units}
                                    collections={collections}
                                />
                                <ListingEditor product={product} units={units} />
                            </div>
                        )}
                    </td>
                </tr>
            )}
        </>
    );
}

function ProductDetails({
    product,
    units,
    collections,
}: {
    product: Product;
    units: CosmeticUnit[];
    collections: Collection[];
}) {
    const source =
        product.kind === "bundles"
            ? product.bundle
            : {
                  name: product.unit.name,
                  description: product.unit.description,
                  base_price: product.unit.base_price,
                  collection: product.unit.collection,
                  enabled: product.unit.enabled,
              };
    const initialContents =
        product.kind === "bundles"
            ? units
                  .filter((unit) =>
                      unit.variants.some((v) =>
                          product.bundle.cosmetic_ids.includes(v.id),
                      ),
                  )
                  .map((unit) => unit.key)
            : [];

    const [name, setName] = useState(source.name);
    const [description, setDescription] = useState(source.description ?? "");
    const [price, setPrice] = useState(String(source.base_price ?? ""));
    const [collection, setCollection] = useState(
        source.collection == null ? "" : String(source.collection),
    );
    const [enabled, setEnabled] = useState(source.enabled);
    const [contents, setContents] = useState(initialContents);

    const priceChanged = Number(price) !== source.base_price;
    const contentsChanged =
        [...contents].sort().join() !== [...initialContents].sort().join();

    // Only what changed goes out: a price or visibility change is also a
    // PayNow call, and there is no reason to make one for nothing.
    const body = {
        ...(product.kind === "bundles"
            ? { bundle_id: product.id }
            : { cosmetic_id: product.id }),
        ...(name !== source.name && { name }),
        ...(description !== (source.description ?? "") && {
            description: description.trim() || null,
        }),
        ...(collection !== String(source.collection ?? "") && {
            collection: collection ? Number(collection) : null,
        }),
        ...(priceChanged && { new_price: Number(price) }),
        ...(enabled !== source.enabled && { enabled }),
        ...(product.kind === "bundles" &&
            contentsChanged && {
                cosmetic_ids: units
                    .filter((unit) => contents.includes(unit.key))
                    .flatMap((unit) => unit.variants.map((v) => v.id)),
            }),
    };

    const save = useAdminMutation<void>(() => ({
        method: "POST",
        path: `/${product.kind}/manage/update`,
        body,
    }));

    return (
        <form
            onSubmit={(event) => {
                event.preventDefault();
                save.mutate();
            }}
            className="flex flex-col gap-3"
        >
            <div className="font-semibold text-gray-300">Details</div>
            {product.kind === "cosmetics" && product.unit.group_id !== null && (
                <p className="text-xs text-gray-500">
                    A variant group: the name and visibility apply to the group,
                    the price and description to every variant.
                </p>
            )}
            <div className="flex flex-wrap gap-3">
                <Field label="Name">
                    <input
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        required
                        className={inputClass}
                    />
                </Field>
                <Field label="Price (USD)">
                    <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={price}
                        onChange={(event) => setPrice(event.target.value)}
                        required
                        className={inputClass}
                    />
                </Field>
                <Field label="Collection">
                    <CollectionSelect
                        collections={collections}
                        value={collection}
                        onChange={setCollection}
                    />
                </Field>
            </div>
            <Field label="Description">
                <textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    rows={2}
                    className={inputClass}
                />
            </Field>
            {product.kind === "bundles" && (
                <Field label="Contents">
                    <CheckList
                        items={units.map((unit) => ({
                            id: unit.key,
                            label: unit.name,
                            hint: unitHint(unit),
                        }))}
                        selected={contents}
                        onChange={setContents}
                    />
                </Field>
            )}
            <Toggle
                label="On sale (off hides it from the store; owners keep it)"
                checked={enabled}
                onChange={setEnabled}
            />
            <PayloadPreview body={body} />
            <ErrorBanner error={save.error} />
            {save.isSuccess && (
                <p className="text-sm text-green-300">Saved.</p>
            )}
            <button
                type="submit"
                disabled={Object.keys(body).length === 1 || save.isPending}
                className={primaryButton}
            >
                <Save size={16} />
                {save.isPending ? "Saving…" : "Save details"}
            </button>
        </form>
    );
}

interface Listing {
    for_sale: boolean;
    available_from: string | null;
    available_until: string | null;
    stock_limit: number | null;
    stock_remaining: number | null;
    customer_limit: number | null;
    customer_limit_days: number | null;
    gifting_disabled: boolean;
    coupons_disabled: boolean;
    requires: number[];
    requires_all: boolean;
    expires_after_days: number | null;
}

function ListingEditor({
    product,
    units,
}: {
    product: Product;
    units: CosmeticUnit[];
}) {
    const path = `/v1/admin/${product.kind}/${product.id}/listing`;
    const listing = useAdminQuery<Listing | null>(path);

    if (listing.isPending) {
        return <p className="text-sm text-gray-500">Loading listing…</p>;
    }
    if (listing.error) return <ErrorBanner error={listing.error} />;

    return (
        <ListingForm
            // Remount on refetch so the form shows what was saved.
            key={JSON.stringify(listing.data)}
            path={path}
            listing={listing.data ?? null}
            units={units}
        />
    );
}

function ListingForm({
    path,
    listing,
    units,
}: {
    path: string;
    listing: Listing | null;
    units: CosmeticUnit[];
}) {
    const text = (value: number | null | undefined) =>
        value == null ? "" : String(value);

    const [from, setFrom] = useState(toLocalInput(listing?.available_from));
    const [until, setUntil] = useState(toLocalInput(listing?.available_until));
    const [stock, setStock] = useState(text(listing?.stock_limit));
    const [perPlayer, setPerPlayer] = useState(text(listing?.customer_limit));
    const [perPlayerDays, setPerPlayerDays] = useState(
        text(listing?.customer_limit_days),
    );
    const [rentalDays, setRentalDays] = useState(
        text(listing?.expires_after_days),
    );
    const [forSale, setForSale] = useState(listing?.for_sale ?? true);
    const [giftingDisabled, setGiftingDisabled] = useState(
        listing?.gifting_disabled ?? false,
    );
    const [couponsDisabled, setCouponsDisabled] = useState(
        listing?.coupons_disabled ?? false,
    );
    // `requires` holds cosmetic ids; owning any variant means owning the unit.
    const [requires, setRequires] = useState(
        units
            .filter((unit) =>
                unit.variants.some((v) => listing?.requires.includes(v.id)),
            )
            .map((unit) => unit.key),
    );
    const [requiresAll, setRequiresAll] = useState(
        listing?.requires_all ?? true,
    );

    const body = {
        for_sale: forSale,
        available_from: fromLocalInput(from),
        available_until: fromLocalInput(until),
        stock_limit: optionalNumber(stock),
        customer_limit: optionalNumber(perPlayer),
        customer_limit_days: optionalNumber(perPlayerDays),
        gifting_disabled: giftingDisabled,
        coupons_disabled: couponsDisabled,
        requires: units
            .filter((unit) => requires.includes(unit.key))
            .map((unit) => unit.first.id),
        requires_all: requiresAll,
        expires_after_days: optionalNumber(rentalDays),
    };

    const save = useAdminMutation<void>(() => ({
        method: "PUT",
        path,
        body,
    }));

    return (
        <form
            onSubmit={(event) => {
                event.preventDefault();
                // The refetch remounts this form with what was saved.
                save.mutate();
            }}
            className="flex flex-col gap-3"
        >
            <div className="font-semibold text-gray-300">
                Listing rules{" "}
                <span className="text-xs font-normal text-gray-500">
                    enforced at checkout; empty means no limit
                </span>
            </div>
            <div className="flex flex-wrap gap-3">
                <Field label="Available from">
                    <input
                        type="datetime-local"
                        value={from}
                        onChange={(event) => setFrom(event.target.value)}
                        className={inputClass}
                    />
                </Field>
                <Field label="Available until">
                    <input
                        type="datetime-local"
                        value={until}
                        onChange={(event) => setUntil(event.target.value)}
                        className={inputClass}
                    />
                </Field>
            </div>
            <div className="flex flex-wrap gap-3">
                <Field
                    label="Stock"
                    help={
                        listing?.stock_remaining != null
                            ? `${listing.stock_remaining} left`
                            : "Units ever sold, refunds excluded"
                    }
                >
                    <input
                        type="number"
                        min="1"
                        value={stock}
                        onChange={(event) => setStock(event.target.value)}
                        className={inputClass}
                    />
                </Field>
                <Field label="Per player" help="Gifts included">
                    <input
                        type="number"
                        min="1"
                        value={perPlayer}
                        onChange={(event) => setPerPlayer(event.target.value)}
                        className={inputClass}
                    />
                </Field>
                <Field label="…within days" help="Empty is forever">
                    <input
                        type="number"
                        min="1"
                        value={perPlayerDays}
                        disabled={!perPlayer}
                        onChange={(event) =>
                            setPerPlayerDays(event.target.value)
                        }
                        className={inputClass}
                    />
                </Field>
                <Field
                    label="Rental days"
                    help="Owned for this long; buying again extends it"
                >
                    <input
                        type="number"
                        min="1"
                        value={rentalDays}
                        onChange={(event) => setRentalDays(event.target.value)}
                        className={inputClass}
                    />
                </Field>
            </div>
            <div className="flex flex-wrap gap-6">
                <Toggle
                    label="For sale (off: hidden from the store, disabled on PayNow)"
                    checked={forSale}
                    onChange={setForSale}
                />
                <Toggle
                    label="Gifting disabled"
                    checked={giftingDisabled}
                    onChange={setGiftingDisabled}
                />
                <Toggle
                    label="Coupons never apply (sales still do)"
                    checked={couponsDisabled}
                    onChange={setCouponsDisabled}
                />
            </div>
            <Field
                label="Requires owning"
                help="The recipient must already own these"
            >
                <CheckList
                    items={units.map((unit) => ({
                        id: unit.key,
                        label: unit.name,
                        hint: unit.type,
                    }))}
                    selected={requires}
                    onChange={setRequires}
                />
            </Field>
            {requires.length > 1 && (
                <Toggle
                    label="Requires all of them (off: any one)"
                    checked={requiresAll}
                    onChange={setRequiresAll}
                />
            )}
            <PayloadPreview body={body} />
            <ErrorBanner error={save.error} />
            {save.isSuccess && (
                <p className="text-sm text-green-300">Saved.</p>
            )}
            <button
                type="submit"
                disabled={save.isPending}
                className={primaryButton}
            >
                <Save size={16} />
                {save.isPending ? "Saving…" : "Save listing rules"}
            </button>
        </form>
    );
}
