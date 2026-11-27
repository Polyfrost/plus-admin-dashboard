/** Mirrors the backend's `permissions::perm`. Bit positions never change. */
export const PERMISSIONS = [
    { key: "ADMINISTRATOR", label: "Administrator", description: "Every permission, and bypasses the role hierarchy." },
    { key: "MANAGE_ROLES", label: "Manage roles", description: "Create, edit and assign roles below your highest one." },
    { key: "VIEW_ANALYTICS", label: "View analytics", description: "Usage analytics. Revenue needs View revenue too." },
    { key: "MANAGE_COSMETICS", label: "Manage cosmetics", description: "Cosmetics, assets, bundles, collections and tags." },
    { key: "MANAGE_STORE", label: "Manage store", description: "Product listings and settings." },
    { key: "GRANT_COSMETICS", label: "Grant cosmetics", description: "Give and revoke cosmetics." },
    { key: "MANAGE_LINKS", label: "Manage links", description: "Tracked share links." },
    { key: "VIEW_PLAYERS", label: "View players", description: "Look players up and read their transactions." },
    { key: "MANAGE_API_TOKENS", label: "Manage API tokens", description: "Keys for external services." },
    { key: "USE_SPECIAL_CHAT", label: "Use Special Chat", description: "Answer Special Chat from the dashboard." },
    { key: "VIEW_REVENUE", label: "View revenue", description: "Monetization analytics, and revenue, refunds and sales counts wherever they appear." },
    { key: "VIEW_ORDERS", label: "View orders", description: "The order list, with buyers and amounts." },
    { key: "MANAGE_DISCOUNTS", label: "Manage discounts", description: "Sales and coupons." },
    { key: "MANAGE_REFERRALS", label: "Manage referrals", description: "Creator codes." },
    { key: "MANAGE_EVENTS", label: "Manage events", description: "Daily reward events and their claims." },
    { key: "ACT_AS_DELEGATE", label: "Act as delegate", description: "Read and answer the chats of players who delegated them to you." },
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number]["key"];

export const Perm = Object.fromEntries(
    PERMISSIONS.map((permission, bit) => [permission.key, 1n << BigInt(bit)]),
) as Record<PermissionKey, bigint>;

/** Whether `granted` covers every flag in `required`. */
export function has(granted: bigint, required: bigint): boolean {
    return (granted & Perm.ADMINISTRATOR) !== 0n || (granted & required) === required;
}

/** Flags an API token can never hold; mirrors the backend's `KEY_FORBIDDEN`. */
export const KEY_FORBIDDEN = Perm.ADMINISTRATOR | Perm.MANAGE_ROLES | Perm.MANAGE_API_TOKENS;

/** Labels for every named flag set in `flags`. */
export function permissionLabels(flags: bigint): string[] {
    return PERMISSIONS.filter((permission) => (flags & Perm[permission.key]) !== 0n).map(
        (permission) => permission.label,
    );
}

/** Whether `granted` has any flag in `mask`: a page with several tabs opens for any of them. */
export function hasAny(granted: bigint, mask: bigint): boolean {
    return (granted & (Perm.ADMINISTRATOR | mask)) !== 0n;
}

export function toHex(color: number): string {
    return `#${color.toString(16).padStart(6, "0")}`;
}

/** Dashboard pages, in nav order, opening for any of their flags. */
export const PAGES = [
    { to: "/cosmetics", label: "Cosmetics", perm: Perm.MANAGE_COSMETICS },
    { to: "/sets", label: "Sets", perm: Perm.MANAGE_COSMETICS },
    { to: "/players", label: "Players", perm: Perm.MANAGE_COSMETICS },
    { to: "/analytics", label: "Analytics", perm: Perm.VIEW_ANALYTICS },
    { to: "/links", label: "Links", perm: Perm.MANAGE_LINKS },
    {
        to: "/store",
        label: "Store",
        perm:
            Perm.MANAGE_STORE |
            Perm.MANAGE_COSMETICS |
            Perm.GRANT_COSMETICS |
            Perm.VIEW_ORDERS |
            Perm.MANAGE_DISCOUNTS |
            Perm.MANAGE_REFERRALS,
    },
    { to: "/tokens", label: "Tokens", perm: Perm.MANAGE_API_TOKENS },
    { to: "/chat", label: "Chat", perm: Perm.USE_SPECIAL_CHAT | Perm.ACT_AS_DELEGATE },
    { to: "/linking", label: "Linking", perm: Perm.VIEW_PLAYERS },
    { to: "/events", label: "Events", perm: Perm.MANAGE_EVENTS },
    { to: "/roles", label: "Roles", perm: Perm.MANAGE_ROLES },
    { to: "/settings", label: "Settings", perm: Perm.ADMINISTRATOR },
] as const;
