import { useMemo, useState } from "react";
import { Pencil, Plus, Save, X } from "lucide-react";
import {
    cosmeticUnits,
    useAdminMutation,
    useCatalog,
    useTags,
    type CosmeticUnit,
    type Tag,
} from "@/lib/store-api";
import {
    Badge,
    CheckList,
    ErrorBanner,
    Field,
    Panel,
    PayloadPreview,
    Table,
    inputClass,
    primaryButton,
    secondaryButton,
} from "./shared";

const TAG_TYPES = ["custom", "color", "category"] as const;

export function TagsPanel() {
    const tags = useTags();
    const catalog = useCatalog();
    const units = useMemo(() => cosmeticUnits(catalog.data), [catalog.data]);
    const [editing, setEditing] = useState<number | null>(null);

    return (
        <Panel
            title="Tags"
            description="Filters in the in-game shop, and a way to aim a sale or coupon at a whole set of products. Tags are mirrored to PayNow once provisioned. Tagging any variant tags its whole group."
        >
            <CreateTag />
            <ErrorBanner error={tags.error ?? catalog.error} />
            <Table
                headers={["Tag", "Type", "Cosmetics", "PayNow", ""]}
                empty={!tags.isPending && !tags.data?.tags.length}
            >
                {tags.data?.tags.map((tag) => {
                    const tagged = units.filter((unit) =>
                        unit.variants.some((v) => v.tag_ids.includes(tag.id)),
                    );
                    const open = editing === tag.id;
                    return (
                        <TagRow
                            key={tag.id}
                            tag={tag}
                            units={units}
                            tagged={tagged}
                            open={open}
                            onToggle={() => setEditing(open ? null : tag.id)}
                        />
                    );
                })}
            </Table>
        </Panel>
    );
}

function TagRow({
    tag,
    units,
    tagged,
    open,
    onToggle,
}: {
    tag: Tag;
    units: CosmeticUnit[];
    tagged: CosmeticUnit[];
    open: boolean;
    onToggle: () => void;
}) {
    return (
        <>
            <tr>
                <td className="px-4 py-3">
                    {tag.display_name ?? tag.name}
                    <span className="ml-2 font-mono text-xs text-gray-500">
                        {tag.name}
                    </span>
                </td>
                <td className="px-4 py-3">
                    <Badge>{tag.tag_type}</Badge>
                </td>
                <td className="px-4 py-3 text-gray-400">{tagged.length}</td>
                <td className="px-4 py-3">
                    {tag.paynow_tag_id ? (
                        <Badge tone="green">mirrored</Badge>
                    ) : (
                        <Badge tone="amber">not yet</Badge>
                    )}
                </td>
                <td className="px-4 py-3">
                    <button
                        onClick={onToggle}
                        title="Edit cosmetics"
                        className="text-gray-400 hover:text-gray-100"
                    >
                        {open ? <X size={16} /> : <Pencil size={16} />}
                    </button>
                </td>
            </tr>
            {open && (
                <tr>
                    <td colSpan={5} className="bg-gray-900/40 px-4 py-4">
                        <TagMembers tag={tag} units={units} tagged={tagged} />
                    </td>
                </tr>
            )}
        </>
    );
}

function TagMembers({
    tag,
    units,
    tagged,
}: {
    tag: Tag;
    units: CosmeticUnit[];
    tagged: CosmeticUnit[];
}) {
    const initial = tagged.map((unit) => unit.key);
    const [selected, setSelected] = useState(initial);

    const added = units.filter(
        (unit) => selected.includes(unit.key) && !initial.includes(unit.key),
    );
    const removed = units.filter(
        (unit) => !selected.includes(unit.key) && initial.includes(unit.key),
    );

    const edit = (path: string) => (list: CosmeticUnit[]) => ({
        method: "POST",
        path,
        body: { tag_id: tag.id, cosmetic_ids: list.map((unit) => unit.first.id) },
    });
    const apply = useAdminMutation(edit("/tags/apply"));
    const remove = useAdminMutation(edit("/tags/remove"));
    const pending = apply.isPending || remove.isPending;

    // Two endpoints, one save: apply the new ones, then drop the old ones.
    const save = async () => {
        if (added.length) await apply.mutateAsync(added);
        if (removed.length) await remove.mutateAsync(removed);
    };

    return (
        <div className="flex flex-col gap-3">
            <CheckList
                items={units.map((unit) => ({
                    id: unit.key,
                    label: unit.name,
                    hint: unit.type,
                }))}
                selected={selected}
                onChange={setSelected}
            />
            <ErrorBanner error={apply.error ?? remove.error} />
            <button
                // The error shows in the banner; nothing else to do with it.
                onClick={() => save().catch(() => {})}
                disabled={(!added.length && !removed.length) || pending}
                className={secondaryButton}
            >
                <Save size={14} />
                {pending
                    ? "Saving…"
                    : `Save (+${added.length} / −${removed.length})`}
            </button>
        </div>
    );
}

function CreateTag() {
    const [name, setName] = useState("");
    const [displayName, setDisplayName] = useState("");
    const [description, setDescription] = useState("");
    const [type, setType] = useState<Tag["tag_type"]>("custom");

    const body = {
        name: name.trim(),
        display_name: displayName.trim() || null,
        description: description.trim() || null,
        tag_type: type,
    };
    const create = useAdminMutation<void>(() => ({
        method: "POST",
        path: "/tags/create",
        body,
    }));

    return (
        <form
            onSubmit={(event) => {
                event.preventDefault();
                create.mutate(undefined, {
                    onSuccess: () => {
                        setName("");
                        setDisplayName("");
                        setDescription("");
                    },
                });
            }}
            className="flex flex-col gap-3 rounded-lg bg-gray-800 p-4 shadow-xl"
        >
            <div className="font-semibold text-gray-300">Create a tag</div>
            <div className="flex flex-wrap gap-3">
                <Field label="Name" help="The id the shop filters by">
                    <input
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        required
                        placeholder="halloween"
                        className={inputClass}
                    />
                </Field>
                <Field label="Display name">
                    <input
                        value={displayName}
                        onChange={(event) => setDisplayName(event.target.value)}
                        placeholder="Halloween"
                        className={inputClass}
                    />
                </Field>
                <Field label="Type">
                    <select
                        value={type}
                        onChange={(event) =>
                            setType(event.target.value as Tag["tag_type"])
                        }
                        className={inputClass}
                    >
                        {TAG_TYPES.map((value) => (
                            <option key={value} value={value}>
                                {value}
                            </option>
                        ))}
                    </select>
                </Field>
            </div>
            <Field label="Description">
                <input
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    className={inputClass}
                />
            </Field>
            <PayloadPreview body={body} />
            <ErrorBanner error={create.error} />
            <button
                type="submit"
                disabled={!name.trim() || create.isPending}
                className={primaryButton}
            >
                <Plus size={16} />
                {create.isPending ? "Creating…" : "Create tag"}
            </button>
        </form>
    );
}
