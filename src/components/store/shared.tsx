import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";

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
 * PayNow owns these schemas and several fields have non-obvious units, so the
 * exact body is always visible before it is sent.
 */
export function PayloadPreview({ body }: { body: unknown }) {
    const [open, setOpen] = useState(false);

    return (
        <div className="flex flex-col gap-2">
            <button
                type="button"
                onClick={() => setOpen(!open)}
                className="flex w-fit items-center gap-1 text-xs text-gray-500 hover:text-gray-300"
            >
                {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                {open ? "Hide" : "Show"} the request PayNow will receive
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
