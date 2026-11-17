import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { PERMISSIONS, Perm } from "@/lib/permissions";

export function Panel({
    title,
    description,
    children,
}: {
    title: string;
    description: ReactNode;
    children: ReactNode;
}) {
    return (
        <div className="flex flex-col gap-4">
            <div>
                <h2 className="text-xl font-bold text-gray-100">{title}</h2>
                <p className="mt-1 max-w-3xl text-sm text-gray-500">
                    {description}
                </p>
            </div>
            {children}
        </div>
    );
}

export function Field({
    label,
    help,
    children,
}: {
    label: string;
    help?: string;
    children: ReactNode;
}) {
    return (
        <label className="flex min-w-40 flex-1 flex-col gap-1 text-sm text-gray-400">
            {label}
            {children}
            {help && <span className="text-xs text-gray-600">{help}</span>}
        </label>
    );
}

export const inputClass =
    "rounded border border-gray-600 bg-gray-700 px-3 py-2 text-gray-200 focus:border-[#61dafb] focus:outline-none";

export function Toggle({
    label,
    checked,
    onChange,
}: {
    label: string;
    checked: boolean;
    onChange: (next: boolean) => void;
}) {
    return (
        <label className="flex items-center gap-2 text-sm text-gray-400">
            <input
                type="checkbox"
                checked={checked}
                onChange={(event) => onChange(event.target.checked)}
                className="h-4 w-4 accent-[#61dafb]"
            />
            {label}
        </label>
    );
}

/**
 * Several fields have non-obvious units, so the exact body is always visible
 * before it is sent.
 */
export function PayloadPreview({
    body,
    target = "the backend",
}: {
    body: unknown;
    target?: string;
}) {
    const [open, setOpen] = useState(false);

    return (
        <div className="flex flex-col gap-2">
            <button
                type="button"
                onClick={() => setOpen(!open)}
                className="flex w-fit items-center gap-1 text-xs text-gray-500 hover:text-gray-300"
            >
                {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                {open ? "Hide" : "Show"} the request {target} will receive
            </button>
            {open && (
                <pre className="overflow-x-auto rounded bg-gray-900 p-3 text-xs text-gray-400">
                    {JSON.stringify(body, null, 2)}
                </pre>
            )}
        </div>
    );
}

export function ErrorBanner({ error }: { error: unknown }) {
    if (!error) return null;
    return (
        <div className="rounded border border-red-700 bg-red-900/40 px-4 py-3 text-sm text-red-200">
            {(error as Error).message}
        </div>
    );
}

export function DeleteButton({
    onDelete,
    pending,
}: {
    onDelete: () => void;
    pending: boolean;
}) {
    return (
        <button
            onClick={onDelete}
            disabled={pending}
            title="Delete"
            className="text-gray-500 hover:text-red-300 disabled:opacity-50"
        >
            <Trash2 size={16} />
        </button>
    );
}

export function Table({
    headers,
    children,
    empty,
}: {
    headers: string[];
    children: ReactNode;
    empty: boolean;
}) {
    if (empty) {
        return <p className="text-sm text-gray-500">Nothing here yet.</p>;
    }

    return (
        <div className="overflow-x-auto rounded-lg bg-gray-800 shadow-xl">
            <table className="w-full text-left text-sm">
                <thead className="border-b border-gray-700 text-xs uppercase tracking-wide text-gray-500">
                    <tr>
                        {headers.map((header) => (
                            <th key={header} className="px-4 py-3 font-semibold">
                                {header}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody className="divide-y divide-gray-700/60 text-gray-300">
                    {children}
                </tbody>
            </table>
        </div>
    );
}

export interface CheckItem<K> {
    id: K;
    label: string;
    hint?: string;
}

/** A searchable multi-select; the search box appears once the list is long. */
export function CheckList<K extends string | number>({
    items,
    selected,
    onChange,
    empty = "Nothing to pick from.",
}: {
    items: CheckItem<K>[];
    selected: K[];
    onChange: (next: K[]) => void;
    empty?: string;
}) {
    const [search, setSearch] = useState("");
    const needle = search.trim().toLowerCase();
    const shown = needle
        ? items.filter((item) =>
              `${item.label} ${item.hint ?? ""} ${item.id}`
                  .toLowerCase()
                  .includes(needle),
          )
        : items;

    if (!items.length) {
        return <p className="text-sm text-gray-500">{empty}</p>;
    }

    return (
        <div className="flex flex-col gap-2">
            {items.length > 8 && (
                <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder={`Search ${items.length}…`}
                    className={inputClass}
                />
            )}
            <div className="flex max-h-60 flex-col overflow-y-auto rounded border border-gray-700 bg-gray-900/50">
                {shown.map((item) => (
                    <label
                        key={item.id}
                        className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-700/50"
                    >
                        <input
                            type="checkbox"
                            checked={selected.includes(item.id)}
                            onChange={(event) =>
                                onChange(
                                    event.target.checked
                                        ? [...selected, item.id]
                                        : selected.filter((id) => id !== item.id),
                                )
                            }
                            className="h-4 w-4 accent-[#61dafb]"
                        />
                        <span className="truncate">{item.label}</span>
                        {item.hint && (
                            <span className="ml-auto shrink-0 text-xs text-gray-500">
                                {item.hint}
                            </span>
                        )}
                    </label>
                ))}
            </div>
            <span className="text-xs text-gray-500">
                {selected.length} selected
            </span>
        </div>
    );
}

/** A small cover image; an animated preview plays on hover when there is one. */
export function Thumb({ cover, preview }: { cover: string | null | undefined; preview?: string | null }) {
    return (
        <div className="group relative h-12 w-12 shrink-0 overflow-hidden rounded bg-gray-900">
            {cover && <img src={cover} alt="" loading="lazy" className="h-full w-full object-contain" />}
            {preview && (
                <img
                    src={preview}
                    alt=""
                    loading="lazy"
                    className="absolute inset-0 hidden h-full w-full object-contain group-hover:block"
                />
            )}
        </div>
    );
}

export function Badge({
    tone = "gray",
    children,
}: {
    tone?: "gray" | "green" | "amber" | "red" | "blue";
    children: ReactNode;
}) {
    const tones = {
        gray: "bg-gray-700 text-gray-300",
        green: "bg-green-900/60 text-green-300",
        amber: "bg-amber-900/60 text-amber-300",
        red: "bg-red-900/60 text-red-300",
        blue: "bg-sky-900/60 text-sky-300",
    };
    return (
        <span
            className={`inline-block rounded px-1.5 py-0.5 text-xs ${tones[tone]}`}
        >
            {children}
        </span>
    );
}

/** Previous / next for a 1-indexed page; hidden when everything fits on one. */
export function Pager({
    page,
    totalPages,
    totalItems,
    onChange,
}: {
    page: number;
    totalPages: number;
    totalItems?: number;
    onChange: (page: number) => void;
}) {
    if (totalPages <= 1) return null;
    return (
        <div className="flex items-center gap-3 text-sm text-gray-400">
            <button
                onClick={() => onChange(page - 1)}
                disabled={page <= 1}
                className={secondaryButton}
            >
                Previous
            </button>
            Page {page} of {totalPages}
            {totalItems !== undefined && ` · ${totalItems} total`}
            <button
                onClick={() => onChange(page + 1)}
                disabled={page >= totalPages}
                className={secondaryButton}
            >
                Next
            </button>
        </div>
    );
}

export const primaryButton =
    "flex w-fit items-center gap-2 rounded bg-[#61dafb] px-4 py-2 font-semibold text-gray-900 disabled:opacity-50";
export const secondaryButton =
    "flex w-fit items-center gap-2 rounded border border-gray-600 px-3 py-1.5 text-sm text-gray-300 hover:text-gray-100 disabled:opacity-50";

/** `<input type="datetime-local">` speaks local time without a zone. */
export function toLocalInput(iso: string | null | undefined): string {
    if (!iso) return "";
    const date = new Date(iso);
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    return date.toISOString().slice(0, 16);
}

export function fromLocalInput(value: string): string | null {
    return value ? new Date(value).toISOString() : null;
}

/** Empty input means "not set"; anything else is a number. */
export function optionalNumber(value: string): number | null {
    return value.trim() === "" ? null : Number(value);
}

/** Checkboxes for permission flags. Administrator implies the rest, so they show ticked. */
export function PermissionPicker({
    flags,
    onChange,
    options = PERMISSIONS,
}: {
    flags: bigint;
    onChange: (flags: bigint) => void;
    options?: readonly (typeof PERMISSIONS)[number][];
}) {
    const administrator = (flags & Perm.ADMINISTRATOR) !== 0n;
    return (
        <fieldset className="grid gap-2 sm:grid-cols-2">
            <legend className="mb-2 text-sm text-gray-400">Permissions</legend>
            {options.map((permission) => {
                const bit = Perm[permission.key];
                const implied = administrator && bit !== Perm.ADMINISTRATOR;
                return (
                    <label
                        key={permission.key}
                        className="flex items-start gap-2 rounded border border-gray-700 px-3 py-2 text-sm"
                    >
                        <input
                            type="checkbox"
                            className="mt-1"
                            checked={(flags & bit) !== 0n || implied}
                            disabled={implied}
                            onChange={(event) =>
                                onChange(event.target.checked ? flags | bit : flags & ~bit)
                            }
                        />
                        <span>
                            <span className="text-gray-200">{permission.label}</span>
                            <span className="block text-xs text-gray-500">
                                {permission.description}
                            </span>
                        </span>
                    </label>
                );
            })}
        </fieldset>
    );
}
