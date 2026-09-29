import { useMemo, useState } from "react";
import { Pencil, Plus, Save, X } from "lucide-react";
import {
    cosmeticUnits,
    useAdminMutation,
    useCatalog,
    useCollections,
    type Collection,
} from "@/lib/store-api";
import {
    DeleteButton,
    ErrorBanner,
    Field,
    Panel,
    Table,
    inputClass,
    primaryButton,
} from "./shared";

export function CollectionsPanel() {
    const collections = useCollections();
    const catalog = useCatalog();
    const units = useMemo(() => cosmeticUnits(catalog.data), [catalog.data]);
    const [editing, setEditing] = useState<number | null>(null);

    const remove = useAdminMutation<number>((id) => ({
        method: "DELETE",
        path: `/collections/delete/${id}`,
    }));

    const members = (id: number) =>
        [
            ...units.filter((unit) => unit.collection === id),
            ...(catalog.data?.bundles ?? []).filter(
                (bundle) => bundle.collection === id,
            ),
        ].length;

    return (
        <Panel
            title="Collections"
            description="Groups of products shown together in the shop, and a way to aim a sale or coupon at all of them. Put a product in a collection from its details under Products."
        >
            <CollectionForm />
            <ErrorBanner error={collections.error ?? remove.error} />
            <Table
                headers={["Collection", "Description", "Products", ""]}
                empty={!collections.isPending && !collections.data?.collections.length}
            >
                {collections.data?.collections.map((collection) => {
                    const open = editing === collection.id;
                    return (
                        <CollectionRow
                            key={collection.id}
                            collection={collection}
                            products={members(collection.id)}
                            open={open}
                            onToggle={() => setEditing(open ? null : collection.id)}
                            pending={remove.isPending}
                            onDelete={() => {
                                if (
                                    confirm(
                                        `Delete the collection "${collection.name}"? Its products stay, just outside any collection.`,
                                    )
                                ) {
                                    remove.mutate(collection.id);
                                }
                            }}
                        />
                    );
                })}
            </Table>
        </Panel>
    );
}

function CollectionRow({
    collection,
    products,
    open,
    onToggle,
    pending,
    onDelete,
}: {
    collection: Collection;
    products: number;
    open: boolean;
    onToggle: () => void;
    pending: boolean;
    onDelete: () => void;
}) {
    return (
        <>
            <tr>
                <td className="px-4 py-3">{collection.name}</td>
                <td className="max-w-xs truncate px-4 py-3 text-gray-500">
                    {collection.description ?? "—"}
                </td>
                <td className="px-4 py-3 text-gray-400">{products}</td>
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
                    <td colSpan={4} className="bg-gray-900/40 px-4 py-4">
                        <CollectionForm initial={collection} />
                    </td>
                </tr>
            )}
        </>
    );
}

/** Creates a collection, or edits `initial`. Both endpoints take a form upload. */
function CollectionForm({ initial }: { initial?: Collection }) {
    const [name, setName] = useState(initial?.name ?? "");
    const [description, setDescription] = useState(initial?.description ?? "");
    const [cover, setCover] = useState<File | null>(null);
    // Remount the file input after a save so it forgets the old pick.
    const [fileKey, setFileKey] = useState(0);

    const save = useAdminMutation<void>(() => {
        const form = new FormData();
        form.append("name", name);
        form.append("description", description);
        if (cover) form.append("file", cover, cover.name);
        return initial
            ? { method: "PUT", path: `/collections/edit/${initial.id}`, body: form }
            : { method: "POST", path: "/collections/create", body: form };
    });

    return (
        <form
            onSubmit={(event) => {
                event.preventDefault();
                save.mutate(undefined, {
                    onSuccess: () => {
                        setCover(null);
                        setFileKey(fileKey + 1);
                        if (!initial) {
                            setName("");
                            setDescription("");
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
                {initial ? `Edit ${initial.name}` : "Create a collection"}
            </div>
            <div className="flex flex-wrap gap-3">
                <Field label="Name">
                    <input
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        required
                        placeholder="Winter 2026"
                        className={inputClass}
                    />
                </Field>
                <Field
                    label="Image"
                    help={initial ? "Leave empty to keep the current one" : "Optional"}
                >
                    <input
                        key={fileKey}
                        type="file"
                        accept="image/*"
                        onChange={(event) =>
                            setCover(event.target.files?.[0] ?? null)
                        }
                        className={inputClass}
                    />
                </Field>
            </div>
            <Field
                label="Description"
                help={initial ? "The backend keeps the old one when this is empty" : undefined}
            >
                <textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    rows={2}
                    className={inputClass}
                />
            </Field>
            <ErrorBanner error={save.error} />
            {initial && save.isSuccess && (
                <p className="text-sm text-green-300">Saved.</p>
            )}
            <button
                type="submit"
                disabled={!name.trim() || save.isPending}
                className={primaryButton}
            >
                {initial ? <Save size={16} /> : <Plus size={16} />}
                {save.isPending
                    ? "Saving…"
                    : initial
                      ? "Save collection"
                      : "Create collection"}
            </button>
        </form>
    );
}
