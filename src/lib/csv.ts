import { isValidElement, type ReactNode } from "react";

interface Table {
    columns: string[];
    rows: ReactNode[][];
}

export function cellText(node: ReactNode): string {
    if (node === null || node === undefined || typeof node === "boolean") {
        return "";
    }
    if (typeof node === "string") return node;
    if (typeof node === "number") return String(node);
    if (Array.isArray(node)) return node.map(cellText).join("");
    if (isValidElement<{ children?: ReactNode }>(node)) {
        return cellText(node.props.children);
    }
    return "";
}

/** A leading =, +, - or @ makes a spreadsheet read the cell as a formula. */
const FORMULA = /^[=+\-@\t\r]/;
/** Numbers and percentages start with a sign but are not formulas. */
const NUMERIC = /^[-+]?[\d.,]+%?$/;
/** A whole cell that is one comma-grouped number, e.g. `-1,024.5`. */
const GROUPED = /^[-+]?\d{1,3}(,\d{3})+(\.\d+)?$/;

function escape(value: string): string {
    // `1,024` is one number, not two fields. Quoting it would be valid CSV but
    // lands in the sheet as text, so the grouping goes instead.
    const plain = GROUPED.test(value) ? value.replaceAll(",", "") : value;
    const safe =
        FORMULA.test(plain) && !NUMERIC.test(plain) ? `'${plain}` : plain;

    return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** RFC 4180: comma separated, CRLF terminated, quotes doubled. */
export function toCsv(table: Table): string {
    const line = (cells: ReactNode[]) =>
        cells.map((cell) => escape(cellText(cell).trim())).join(",");

    return [line(table.columns), ...table.rows.map(line)].join("\r\n");
}

export function csvFilename(title: string, scope?: string | null): string {
    const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

    return `${[slug || "table", scope].filter(Boolean).join("_")}.csv`;
}

export function downloadCsv(filename: string, table: Table): void {
    // The BOM is what makes Excel read the file as UTF-8 rather than latin-1.
    const blob = new Blob(["\uFEFF", toCsv(table)], {
        type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);

    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();

    // Revoking in the same tick can cancel the download in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 0);
}
