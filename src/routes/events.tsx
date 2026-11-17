import { createFileRoute } from "@tanstack/react-router";
import { Fragment, useMemo, useState } from "react";
import { CalendarDays, Download, Pencil, Plus, Save, Trash2, Users, X } from "lucide-react";
import {
    cosmeticUnits,
    formatMinor,
    useAdminMutation,
    useAdminQuery,
    useCatalog,
} from "@/lib/store-api";
import { csvFilename, downloadCsv } from "@/lib/csv";
import {
    Badge,
    CheckList,
    DeleteButton,
    ErrorBanner,
    Field,
    Pager,
    Panel,
    PayloadPreview,
    Table,
    Toggle,
    inputClass,
    primaryButton,
    secondaryButton,
} from "@/components/store/shared";
import { useTargetItems, type Targets } from "@/components/store/DiscountsPanel";

export const Route = createFileRoute("/events")({
    component: Events,
});

/* ---------- Shapes, mirroring the backend's `v1::events` ---------- */

interface CouponReward {
    type: "coupon";
    name: string;
    prefix: string;
    percent_off: number | null;
    amount_off_minor: number | null;
    currency: string | null;
    applies_to_all: boolean;
    apply_individually: boolean;
    targets: Targets;
    min_subtotal_minor: number | null;
    valid_days: number | null;
}

type Reward =
    | { type: "cosmetic"; cosmetic_id: number }
    | CouponReward
    | { type: "external"; name: string; message: string; preview_url: string | null };

const MEASURES = {
    playtime: { label: "Play time", unit: "minutes", scale: 60 },
    chat_messages: { label: "Chat messages", unit: "messages", scale: 1 },
    friends: { label: "Friends", unit: "friends", scale: 1 },
    host_world: { label: "Host a world", unit: "minutes", scale: 60 },
    linked_account: { label: "Linked account", unit: "", scale: 1 },
} as const;
type Measure = keyof typeof MEASURES;

interface Requirement {
    type: Measure;
    target: number;
    provider?: "discord";
}

interface DayReward {
    day: string;
    reward: Reward;
    requirements: Requirement[];
}

interface EventConfig {
    name: string;
    kind: "daily_rewards";
    claim_window_hours: number;
    rewards: DayReward[];
}

interface EventView extends EventConfig {
    id: number;
    starts_at: string;
    ends_at: string;
}

type Granted =
    | { type: "cosmetic"; cosmetic_ids: number[]; emote_ids: number[] }
    | { type: "coupon"; code: string; discount_id: number; expires_at: string | null }
    | { type: "external"; name: string; message: string; preview_url: string | null };

interface Claim {
    player: string;
    username: string | null;
    slot: string;
    granted: Granted;
    claimed_at: string;
}

const NO_TARGETS: Targets = { collections: [], tags: [], cosmetics: [], cosmetic_groups: [], bundles: [] };

const today = () => new Date().toISOString().slice(0, 10);
const nextDay = (day: string) => {
    const date = new Date(`${day}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString().slice(0, 10);
};

function newReward(type: Reward["type"]): Reward {
    if (type === "cosmetic") return { type, cosmetic_id: 0 };
    if (type === "external") return { type, name: "", message: "", preview_url: null };
    return {
        type,
        name: "",
        prefix: "",
        percent_off: 10,
        amount_off_minor: null,
        currency: null,
        applies_to_all: true,
        apply_individually: true,
        targets: NO_TARGETS,
        min_subtotal_minor: null,
        valid_days: null,
    };
}

function useCosmeticNames() {
    const catalog = useCatalog();
    const units = useMemo(() => cosmeticUnits(catalog.data), [catalog.data]);
    return { units, name: (id: number) => units.find((u) => u.variants.some((v) => v.id === id))?.name ?? `#${id}` };
}

function describeReward(reward: Reward, name: (id: number) => string): string {
    switch (reward.type) {
        case "cosmetic":
            return name(reward.cosmetic_id);
        case "coupon":
            return `${reward.name}: ${
                reward.percent_off != null
                    ? `${reward.percent_off}% off`
                    : `${formatMinor(reward.amount_off_minor, reward.currency)} off`
            } coupon`;
        case "external":
            return `${reward.name} (external)`;
    }
}

function describeGranted(granted: Granted, name: (id: number) => string): string {
    switch (granted.type) {
        case "cosmetic":
            return [...granted.cosmetic_ids, ...granted.emote_ids].map(name).join(", ");
        case "coupon":
            return `${granted.code}${granted.expires_at ? ` (until ${new Date(granted.expires_at).toLocaleDateString()})` : ""}`;
        case "external":
            return granted.name;
    }
}

/* ---------- Page ---------- */

function Events() {
    const events = useAdminQuery<EventView[]>("/v1/admin/events");
    const { name } = useCosmeticNames();
    const [editing, setEditing] = useState<number | null>(null);
    const [claimsOf, setClaimsOf] = useState<number | null>(null);
    const remove = useAdminMutation<number>((id) => ({ method: "DELETE", path: `/v1/admin/events/${id}` }));
    const now = Date.now();

    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
            <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-100">
                <CalendarDays size={22} className="text-[#61dafb]" />
                Events
            </h1>
            <Panel
                title="Daily rewards"
                description="Each event opens one reward per UTC day, claimable in game for the claim window from the start of its day. Rewards stay hidden from players until they open. A reward can ask for activity first (play time, messages, friends, hosting, a linked account), counted from when it opens. Editing keeps claims against their day."
            >
                <EventForm />
                <ErrorBanner error={events.error ?? remove.error} />
                <Table headers={["Name", "Runs", "Rewards", "Status", ""]} empty={!events.isPending && !events.data?.length}>
                    {events.data?.map((event) => {
                        const live = new Date(event.starts_at).getTime() <= now && now < new Date(event.ends_at).getTime();
                        const over = new Date(event.ends_at).getTime() <= now;
                        return (
                            <Fragment key={event.id}>
                                <tr>
                                    <td className="px-4 py-3">{event.name}</td>
                                    <td className="px-4 py-3 text-xs text-gray-500">
                                        {new Date(event.starts_at).toLocaleString()} → {new Date(event.ends_at).toLocaleString()}
                                    </td>
                                    <td className="max-w-xs truncate px-4 py-3 text-gray-400">
                                        {event.rewards.length} day(s) · {event.claim_window_hours}h window ·{" "}
                                        {event.rewards.map((day) => describeReward(day.reward, name)).join(", ")}
                                    </td>
                                    <td className="px-4 py-3">
                                        {live ? <Badge tone="green">running</Badge> : over ? <Badge>ended</Badge> : <Badge tone="blue">upcoming</Badge>}
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-3">
                                            <button
                                                onClick={() => setClaimsOf(claimsOf === event.id ? null : event.id)}
                                                title="Claims"
                                                className="text-gray-400 hover:text-gray-100"
                                            >
                                                <Users size={16} />
                                            </button>
                                            <button
                                                onClick={() => setEditing(editing === event.id ? null : event.id)}
                                                title="Edit"
                                                className="text-gray-400 hover:text-gray-100"
                                            >
                                                {editing === event.id ? <X size={16} /> : <Pencil size={16} />}
                                            </button>
                                            <DeleteButton
                                                pending={remove.isPending}
                                                onDelete={() => {
                                                    if (confirm(`Delete "${event.name}" and its claims? What players already received is kept.`)) {
                                                        remove.mutate(event.id);
                                                    }
                                                }}
                                            />
                                        </div>
                                    </td>
                                </tr>
                                {(editing === event.id || claimsOf === event.id) && (
                                    <tr>
                                        <td colSpan={5} className="bg-gray-900/40 px-4 py-4">
                                            {editing === event.id ? (
                                                <EventForm initial={event} />
                                            ) : (
                                                <Claims event={event} name={name} />
                                            )}
                                        </td>
                                    </tr>
                                )}
                            </Fragment>
                        );
                    })}
                </Table>
            </Panel>
        </div>
    );
}

/* ---------- Claims ---------- */

const CLAIMS_PAGE = 50;

function Claims({ event, name }: { event: EventView; name: (id: number) => string }) {
    const claims = useAdminQuery<Claim[]>(`/v1/admin/events/${event.id}/claims`);
    const [day, setDay] = useState("");
    const [page, setPage] = useState(1);
    // The backend sends every claim; the table pages them here.
    const shown = (claims.data ?? []).filter((claim) => !day || claim.slot === day);
    const totalPages = Math.max(1, Math.ceil(shown.length / CLAIMS_PAGE));
    const rows = shown.map((claim) => [
        claim.username ?? claim.player,
        claim.player,
        claim.slot,
        claim.granted.type,
        describeGranted(claim.granted, name),
        new Date(claim.claimed_at).toLocaleString(),
    ]);

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end gap-3">
                <div className="font-semibold text-gray-300">
                    Claims of {event.name} ({shown.length})
                </div>
                <select
                    value={day}
                    onChange={(e) => {
                        setDay(e.target.value);
                        setPage(1);
                    }}
                    className={`${inputClass} ml-auto`}
                >
                    <option value="">Every day</option>
                    {event.rewards.map((reward) => (
                        <option key={reward.day} value={reward.day}>
                            {reward.day}
                        </option>
                    ))}
                </select>
                <button
                    onClick={() =>
                        downloadCsv(csvFilename(`${event.name} claims`, day || null), {
                            columns: ["Player", "UUID", "Day", "Type", "Granted", "Claimed"],
                            rows,
                        })
                    }
                    disabled={!rows.length}
                    className={secondaryButton}
                >
                    <Download size={14} />
                    CSV
                </button>
            </div>
            <ErrorBanner error={claims.error} />
            <Table headers={["Player", "Day", "Granted", "Claimed"]} empty={!claims.isPending && !shown.length}>
                {rows.slice((page - 1) * CLAIMS_PAGE, page * CLAIMS_PAGE).map((row, index) => (
                    <tr key={index}>
                        <td className="px-4 py-2" title={row[1]}>
                            {row[0]}
                        </td>
                        <td className="px-4 py-2 font-mono text-xs">{row[2]}</td>
                        <td className="px-4 py-2">
                            <Badge>{row[3]}</Badge> {row[4]}
                        </td>
                        <td className="px-4 py-2 text-xs text-gray-500">{row[5]}</td>
                    </tr>
                ))}
            </Table>
            <Pager page={page} totalPages={totalPages} totalItems={shown.length} onChange={setPage} />
        </div>
    );
}

/* ---------- Form ---------- */

function EventForm({ initial }: { initial?: EventView }) {
    const [name, setName] = useState(initial?.name ?? "");
    const [windowHours, setWindowHours] = useState(String(initial?.claim_window_hours ?? 24));
    const [days, setDays] = useState<DayReward[]>(
        initial?.rewards ?? [{ day: today(), reward: newReward("cosmetic"), requirements: [] }],
    );

    const body: EventConfig = {
        name,
        kind: "daily_rewards",
        claim_window_hours: Number(windowHours),
        rewards: days,
    };
    const save = useAdminMutation<void>(() => ({
        method: "POST",
        path: initial ? `/v1/admin/events/${initial.id}` : "/v1/admin/events",
        body,
    }));

    const patch = (index: number, next: Partial<DayReward>) =>
        setDays(days.map((day, i) => (i === index ? { ...day, ...next } : day)));

    return (
        <form
            onSubmit={(event) => {
                event.preventDefault();
                save.mutate(undefined, {
                    onSuccess: initial
                        ? undefined
                        : () => {
                              setName("");
                              setDays([{ day: today(), reward: newReward("cosmetic"), requirements: [] }]);
                          },
                });
            }}
            className={initial ? "flex flex-col gap-3" : "flex flex-col gap-3 rounded-lg bg-gray-800 p-4 shadow-xl"}
        >
            <div className="font-semibold text-gray-300">{initial ? `Edit ${initial.name}` : "Create an event"}</div>
            <div className="flex flex-wrap gap-3">
                <Field label="Name">
                    <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Advent calendar" className={inputClass} />
                </Field>
                <Field label="Claim window (hours)" help="From the start of each UTC day; 24 is that day only">
                    <input
                        type="number"
                        min={1}
                        max={65535}
                        value={windowHours}
                        onChange={(e) => setWindowHours(e.target.value)}
                        required
                        className={inputClass}
                    />
                </Field>
            </div>

            {days.map((day, index) => (
                <DayEditor
                    key={index}
                    day={day}
                    onChange={(next) => patch(index, next)}
                    onRemove={days.length > 1 ? () => setDays(days.filter((_, i) => i !== index)) : undefined}
                />
            ))}
            <button
                type="button"
                onClick={() => {
                    const last = days.at(-1);
                    setDays([
                        ...days,
                        last
                            ? { ...structuredClone(last), day: nextDay(last.day) }
                            : { day: today(), reward: newReward("cosmetic"), requirements: [] },
                    ]);
                }}
                className={secondaryButton}
            >
                <Plus size={16} />
                Add the next day
            </button>

            <PayloadPreview body={body} />
            <ErrorBanner error={save.error} />
            {save.isSuccess && initial && <p className="text-sm text-green-300">Saved.</p>}
            <button type="submit" disabled={!name.trim() || !days.length || save.isPending} className={initial ? secondaryButton : primaryButton}>
                {initial ? <Save size={16} /> : <Plus size={16} />}
                {save.isPending ? "Saving…" : initial ? "Save changes" : "Create event"}
            </button>
        </form>
    );
}

function DayEditor({
    day,
    onChange,
    onRemove,
}: {
    day: DayReward;
    onChange: (next: Partial<DayReward>) => void;
    onRemove?: () => void;
}) {
    const { units } = useCosmeticNames();
    const reward = day.reward;
    const setReward = (next: Partial<Reward>) => onChange({ reward: { ...reward, ...next } as Reward });

    return (
        <div className="flex flex-col gap-3 rounded border border-gray-700 p-3">
            <div className="flex flex-wrap items-end gap-3">
                <Field label="Day (UTC)">
                    <input type="date" value={day.day} onChange={(e) => onChange({ day: e.target.value })} required className={inputClass} />
                </Field>
                <Field label="Reward">
                    <select
                        value={reward.type}
                        onChange={(e) => onChange({ reward: newReward(e.target.value as Reward["type"]) })}
                        className={inputClass}
                    >
                        <option value="cosmetic">Cosmetic</option>
                        <option value="coupon">Coupon (one code per player)</option>
                        <option value="external">External (fulfilled by staff)</option>
                    </select>
                </Field>
                {reward.type === "cosmetic" && (
                    <Field label="Cosmetic" help="A grouped cosmetic grants its whole group">
                        <select
                            value={reward.cosmetic_id || ""}
                            onChange={(e) => setReward({ cosmetic_id: Number(e.target.value) })}
                            required
                            className={inputClass}
                        >
                            <option value="">Pick a cosmetic</option>
                            {units.map((unit) => (
                                <option key={unit.key} value={unit.first.id}>
                                    {unit.name} ({unit.type})
                                </option>
                            ))}
                        </select>
                    </Field>
                )}
                {onRemove && (
                    <button type="button" onClick={onRemove} title="Remove day" className="mb-2 text-gray-500 hover:text-red-300">
                        <Trash2 size={16} />
                    </button>
                )}
            </div>
            {reward.type === "coupon" && <CouponEditor reward={reward} onChange={setReward} />}
            {reward.type === "external" && (
                <div className="flex flex-wrap gap-3">
                    <Field label="Name">
                        <input value={reward.name} onChange={(e) => setReward({ name: e.target.value })} required placeholder="Discord Nitro" className={inputClass} />
                    </Field>
                    <Field label="Message" help="Shown to the player, e.g. how to collect it">
                        <input value={reward.message} onChange={(e) => setReward({ message: e.target.value })} required className={inputClass} />
                    </Field>
                    <Field label="Image or video URL">
                        <input
                            type="url"
                            value={reward.preview_url ?? ""}
                            onChange={(e) => setReward({ preview_url: e.target.value || null })}
                            className={inputClass}
                        />
                    </Field>
                </div>
            )}
            <RequirementsEditor requirements={day.requirements} onChange={(requirements) => onChange({ requirements })} />
        </div>
    );
}

function CouponEditor({ reward, onChange }: { reward: CouponReward; onChange: (next: Partial<CouponReward>) => void }) {
    const items = useTargetItems();
    const fixed = reward.amount_off_minor != null;
    const products = [
        ...reward.targets.bundles.map((id) => `b${id}`),
        ...reward.targets.cosmetic_groups.map((id) => `g${id}`),
        ...reward.targets.cosmetics.map((id) => `c${id}`),
    ];
    const ids = (keys: string[], prefix: string) => keys.filter((k) => k.startsWith(prefix)).map((k) => Number(k.slice(1)));
    const setTargets = (next: Partial<Targets>) => onChange({ targets: { ...reward.targets, ...next } });

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-3">
                <Field label="Coupon name">
                    <input value={reward.name} onChange={(e) => onChange({ name: e.target.value })} required className={inputClass} />
                </Field>
                <Field label="Code prefix" help="Up to 12 characters, e.g. XMAS → XMAS-7KQ2M9TA">
                    <input
                        value={reward.prefix}
                        maxLength={12}
                        onChange={(e) => onChange({ prefix: e.target.value.toUpperCase() })}
                        required
                        className={`${inputClass} font-mono`}
                    />
                </Field>
                <Field label="Type">
                    <select
                        value={fixed ? "fixed" : "percent"}
                        onChange={(e) =>
                            onChange(
                                e.target.value === "fixed"
                                    ? { percent_off: null, amount_off_minor: 100, currency: "usd" }
                                    : { percent_off: 10, amount_off_minor: null, currency: null },
                            )
                        }
                        className={inputClass}
                    >
                        <option value="percent">Percent off</option>
                        <option value="fixed">Fixed amount off</option>
                    </select>
                </Field>
                {fixed ? (
                    <>
                        <Field label="Amount off" help="Major units">
                            <input
                                type="number"
                                min="0.01"
                                step="0.01"
                                value={(reward.amount_off_minor ?? 0) / 100}
                                onChange={(e) => onChange({ amount_off_minor: Math.round(Number(e.target.value) * 100) })}
                                className={inputClass}
                            />
                        </Field>
                        <Field label="Currency">
                            <input
                                value={reward.currency ?? ""}
                                onChange={(e) => onChange({ currency: e.target.value.toLowerCase() })}
                                className={inputClass}
                            />
                        </Field>
                    </>
                ) : (
                    <Field label="Percent off">
                        <input
                            type="number"
                            min={1}
                            max={100}
                            value={reward.percent_off ?? ""}
                            onChange={(e) => onChange({ percent_off: Number(e.target.value) })}
                            className={inputClass}
                        />
                    </Field>
                )}
                <Field label="Valid for (days)" help="After claiming; empty never expires">
                    <input
                        type="number"
                        min={1}
                        value={reward.valid_days ?? ""}
                        onChange={(e) => onChange({ valid_days: e.target.value ? Number(e.target.value) : null })}
                        className={inputClass}
                    />
                </Field>
                <Field label="Minimum basket" help="Major units; empty for none">
                    <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={reward.min_subtotal_minor != null ? reward.min_subtotal_minor / 100 : ""}
                        onChange={(e) =>
                            onChange({ min_subtotal_minor: e.target.value ? Math.round(Number(e.target.value) * 100) : null })
                        }
                        className={inputClass}
                    />
                </Field>
            </div>
            {fixed && (
                <Toggle
                    label="Take the amount off each covered item, not once off the order"
                    checked={reward.apply_individually}
                    onChange={(apply_individually) => onChange({ apply_individually })}
                />
            )}
            <Toggle
                label="Applies to the whole store"
                checked={reward.applies_to_all}
                onChange={(applies_to_all) => onChange({ applies_to_all, targets: NO_TARGETS })}
            />
            {!reward.applies_to_all && (
                <div className="grid gap-3 md:grid-cols-3">
                    <Field label="Products">
                        <CheckList
                            items={items.products}
                            selected={products}
                            onChange={(keys) =>
                                setTargets({ bundles: ids(keys, "b"), cosmetic_groups: ids(keys, "g"), cosmetics: ids(keys, "c") })
                            }
                        />
                    </Field>
                    <Field label="Tags">
                        <CheckList items={items.tags} selected={reward.targets.tags} onChange={(tags) => setTargets({ tags })} empty="No tags yet." />
                    </Field>
                    <Field label="Collections">
                        <CheckList
                            items={items.collections}
                            selected={reward.targets.collections}
                            onChange={(collections) => setTargets({ collections })}
                            empty="No collections yet."
                        />
                    </Field>
                </div>
            )}
        </div>
    );
}

function RequirementsEditor({
    requirements,
    onChange,
}: {
    requirements: Requirement[];
    onChange: (next: Requirement[]) => void;
}) {
    const patch = (index: number, next: Partial<Requirement>) =>
        onChange(requirements.map((r, i) => (i === index ? { ...r, ...next } : r)));

    return (
        <div className="flex flex-col gap-2 text-sm text-gray-400">
            {requirements.map((requirement, index) => {
                const measure = MEASURES[requirement.type];
                return (
                    <div key={index} className="flex flex-wrap items-center gap-2">
                        <span>Requires</span>
                        <select
                            value={requirement.type}
                            onChange={(e) => {
                                const type = e.target.value as Measure;
                                patch(index, type === "linked_account" ? { type, target: 1, provider: "discord" } : { type, target: MEASURES[type].scale, provider: undefined });
                            }}
                            className={inputClass}
                        >
                            {Object.entries(MEASURES).map(([key, m]) => (
                                <option key={key} value={key}>
                                    {m.label}
                                </option>
                            ))}
                        </select>
                        {requirement.type === "linked_account" ? (
                            <span>on Discord</span>
                        ) : (
                            <>
                                <input
                                    type="number"
                                    min={1}
                                    value={requirement.target / measure.scale}
                                    onChange={(e) => patch(index, { target: Math.round(Number(e.target.value) * measure.scale) })}
                                    className={`${inputClass} w-28`}
                                />
                                <span>{measure.unit}</span>
                            </>
                        )}
                        <button
                            type="button"
                            onClick={() => onChange(requirements.filter((_, i) => i !== index))}
                            className="text-gray-500 hover:text-red-300"
                            title="Remove requirement"
                        >
                            <X size={14} />
                        </button>
                    </div>
                );
            })}
            <button
                type="button"
                onClick={() => onChange([...requirements, { type: "playtime", target: 30 * 60 }])}
                className="w-fit text-xs text-[#61dafb] hover:underline"
            >
                + Add a requirement
            </button>
        </div>
    );
}
