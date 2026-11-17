import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
    useInfiniteQuery,
    useMutation,
    useQuery,
    useQueryClient,
    type QueryKey,
} from "@tanstack/react-query";
import {
    Ban,
    Check,
    LogOut,
    MessagesSquare,
    Pencil,
    Plug,
    Send,
    Trash2,
    UserMinus,
    UserPlus,
    X,
} from "lucide-react";
import { adminRequest } from "@/lib/store-api";
import { useRequiredMe, useSession, type Session } from "@/lib/session";
import {
    Badge,
    ErrorBanner,
    Field,
    Panel,
    inputClass,
    primaryButton,
    secondaryButton,
} from "@/components/store/shared";

export const Route = createFileRoute("/chat")({
    component: Chat,
});

/* ---------- Shapes, mirroring the backend's groups and social routes ---------- */

interface Target {
    uuid: string;
    username: string | null;
}

interface Group {
    id: number;
    kind: "dm" | "group" | "party";
    name: string | null;
    members: string[];
    last_message: { content: string; sender: string; sent_at: string } | null;
    unread: boolean;
    /** An unclaimed Special Chat group. */
    special: boolean;
    /** A Special Chat group whose last message is from the player, not staff. */
    awaiting_reply: boolean;
}

interface Message {
    id: number;
    sender: string;
    content: string;
    sent_at: string;
    edited_at: string | null;
    session_invite: { id: number; session_id: string; status: string } | null;
}

interface CursorPage<T> {
    items: T[];
    cursor?: string | null;
}

interface Friend {
    player: string;
    kind: string;
    since: string;
    online: boolean;
    status: unknown;
}

interface FriendRequest {
    id: number;
    player: string;
    created_at: string;
}

interface Blocked {
    player: string;
    since: string;
}

interface Packet {
    type: string;
    [key: string]: unknown;
}

/** Who the page acts as: the signed-in account, a player who delegated their chats, or a Special Chat target. */
type Identity =
    | { kind: "self"; uuid: string }
    | { kind: "delegate"; uuid: string }
    | { kind: "target"; uuid: string };

const identityKey = (identity: Identity) => `${identity.kind}:${identity.uuid}`;

/* ---------- Page ---------- */

function Chat() {
    const [loaded, setLoaded] = useState(false);

    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
            <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-100">
                <MessagesSquare size={22} className="text-[#61dafb]" />
                Social
            </h1>
            {loaded ? (
                <Loaded />
            ) : (
                <Panel
                    title="Chats, friends and Special Chat"
                    description="Reads and answers chats as your own account, as a player who made you their delegate (needs Act as delegate), or as a Special Chat recipient. Nothing is fetched and no websocket opens until you load it."
                >
                    <button onClick={() => setLoaded(true)} className={primaryButton}>
                        <Plug size={16} />
                        Load
                    </button>
                </Panel>
            )}
        </div>
    );
}

function Loaded() {
    const session = useSession();
    const me = useRequiredMe();
    const targets = useQuery({
        queryKey: ["chat-targets", session.env],
        queryFn: () => adminRequest(session, "GET", "/v1/admin/special-chat/targets") as Promise<Target[]>,
        enabled: true,
        // Staff without Use Special Chat just don't get the targets.
        retry: false,
    });
    const delegations = useQuery({
        queryKey: ["chat-delegations", session.env],
        queryFn: () => adminRequest(session, "GET", "/groups/delegations") as Promise<string[]>,
        enabled: true,
    });

    const delegateName = useNames(session, ["chat-delegations", session.env], delegations.data ?? []);

    const options: { identity: Identity; label: string }[] = [
        { identity: { kind: "self", uuid: me.id }, label: `Yourself (${me.username ?? me.id.slice(0, 8)})` },
        ...(delegations.data ?? []).map((uuid) => ({
            identity: { kind: "delegate", uuid } as Identity,
            label: `As ${delegateName(uuid)} (delegated to you)`,
        })),
        ...(targets.data ?? []).map((target) => ({
            identity: { kind: "target", uuid: target.uuid } as Identity,
            label: `Special Chat as ${target.username ?? target.uuid}`,
        })),
    ];
    // Special Chat first when there is one: that is what staff come here for.
    const [picked, setPicked] = useState<string>();
    const fallback = options.find((option) => option.identity.kind === "target") ?? options[0];
    const option = options.find((o) => identityKey(o.identity) === picked) ?? fallback;

    return (
        <>
            <div className="flex flex-wrap items-end gap-3">
                <Field label="Send messages as">
                    <select
                        value={identityKey(option.identity)}
                        onChange={(event) => setPicked(event.target.value)}
                        className={inputClass}
                    >
                        {options.map((o) => (
                            <option key={identityKey(o.identity)} value={identityKey(o.identity)}>
                                {o.label}
                            </option>
                        ))}
                    </select>
                </Field>
            </div>
            <ErrorBanner error={delegations.error} />
            <AsIdentity key={identityKey(option.identity)} identity={option.identity} />
        </>
    );
}

/** Builds the session to call the backend as `identity`. */
function useIdentitySession(identity: Identity) {
    const session = useSession();
    const token = useQuery({
        queryKey: ["chat-token", session.env, identity.uuid],
        queryFn: () =>
            adminRequest(session, "POST", "/v1/admin/special-chat/token", {
                uuid: identity.uuid,
            }) as Promise<{ token: string }>,
        enabled: identity.kind === "target",
        staleTime: Infinity,
        // Renewed well inside its 2h life.
        refetchInterval: 90 * 60_000,
    });

    const player: Session | undefined =
        identity.kind === "self"
            ? { env: session.env }
            : identity.kind === "delegate"
              ? { env: session.env, actAs: identity.uuid }
              : token.data && { env: session.env, bearer: token.data.token };

    return { player, error: token.error };
}

type Tab = "chats" | "friends" | "requests" | "blocked";

function AsIdentity({ identity }: { identity: Identity }) {
    const queryClient = useQueryClient();
    const { player, error } = useIdentitySession(identity);
    const base: QueryKey = ["chat", player?.env, identityKey(identity)];
    const [tab, setTab] = useState<Tab>("chats");
    // Social routes act as the signed-in account only, never a delegate or target.
    const social = identity.kind === "self";

    const [log, setLog] = useState<string[]>([]);
    const socket = useSocket(player, (packet) => {
        setLog((log) => [`← ${JSON.stringify(packet)}`, ...log].slice(0, 100));
        queryClient.invalidateQueries({ queryKey: base });
    });
    // Catch up on whatever happened while the socket was down.
    useEffect(() => {
        if (socket.state === "open") queryClient.invalidateQueries({ queryKey: base });
    }, [socket.state]); // eslint-disable-line react-hooks/exhaustive-deps

    if (!player) {
        return error ? <ErrorBanner error={error} /> : <p className="text-sm text-gray-500">Connecting…</p>;
    }

    return (
        <>
            <div className="flex flex-wrap items-center gap-2 border-b border-gray-800">
                {(["chats", "friends", "requests", "blocked"] as const)
                    .filter((t) => social || t === "chats")
                    .map((t) => (
                        <button
                            key={t}
                            onClick={() => setTab(t)}
                            className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium capitalize ${
                                t === tab
                                    ? "border-[#61dafb] text-[#61dafb]"
                                    : "border-transparent text-gray-400 hover:text-gray-100"
                            }`}
                        >
                            {t}
                            {t === "requests" && <RequestCount player={player} base={base} />}
                        </button>
                    ))}
                <span className="ml-auto">
                    <Badge tone={socket.state === "open" ? "green" : undefined}>
                        websocket {socket.state}
                    </Badge>
                </span>
            </div>

            {tab === "chats" && <Chats player={player} identity={identity} base={base} />}
            {tab === "friends" && <Friends player={player} base={base} onOpen={() => setTab("chats")} />}
            {tab === "requests" && <Requests player={player} base={base} />}
            {tab === "blocked" && <BlockedList player={player} base={base} />}

            {identity.kind !== "delegate" && (
                <Panel
                    title="Raw websocket"
                    description="Every packet the server pushes to this connection, and a box to send server-bound packets as JSON."
                >
                    <RawConsole
                        open={socket.state === "open"}
                        log={log}
                        onSend={(data) => {
                            socket.send(data);
                            setLog((log) => [`→ ${data}`, ...log].slice(0, 100));
                        }}
                    />
                </Panel>
            )}
        </>
    );
}

/* ---------- Shared helpers ---------- */

/** Keeps a websocket open for `player`, reconnecting when it drops. */
function useSocket(player: Session | undefined, onPacket: (packet: Packet) => void) {
    const [state, setState] = useState<"connecting" | "open" | "closed">("closed");
    const socket = useRef<WebSocket | null>(null);
    const handler = useRef(onPacket);
    handler.current = onPacket;
    const env = player?.env;
    const bearer = player?.bearer;
    const actAs = player?.actAs;
    const enabled = !!player;

    useEffect(() => {
        if (!enabled || !env) return;
        let stopped = false;
        let retry: number | undefined;

        const connect = () => {
            setState("connecting");
            // Headers can't be set here either, so act-as is a query parameter.
            const url = `${env.replace(/^http/, "ws")}/websocket${actAs ? `?act_as=${actAs}` : ""}`;
            // Browsers can't set Authorization here: a token rides as the
            // subprotocol, and your own session as the cookie.
            const ws = bearer ? new WebSocket(url, ["bearer", bearer]) : new WebSocket(url);
            socket.current = ws;
            ws.onopen = () => setState("open");
            ws.onmessage = (event) => {
                try {
                    handler.current(JSON.parse(event.data));
                } catch {
                    /* not a packet */
                }
            };
            ws.onclose = () => {
                setState("closed");
                if (!stopped) retry = window.setTimeout(connect, 3000);
            };
        };
        connect();

        return () => {
            stopped = true;
            window.clearTimeout(retry);
            socket.current?.close();
        };
    }, [enabled, env, bearer, actAs]);

    return { state, send: (data: string) => socket.current?.send(data) };
}

/** UUID → username for everyone in `ids`, resolved once. */
function useNames(player: Session, base: QueryKey, ids: string[]) {
    const unique = [...new Set(ids)].sort();
    const names = useQuery({
        queryKey: [...base, "names", unique.join()],
        queryFn: async () => {
            const { players } = (await adminRequest(player, "POST", "/players/resolve", {
                ids: unique,
            })) as { players: { id: string; username: string }[] };
            return new Map(players.map((p) => [p.id, p.username]));
        },
        enabled: unique.length > 0,
        staleTime: Infinity,
    });
    return (uuid: string) => names.data?.get(uuid) ?? uuid.slice(0, 8);
}

/** A UUID as is, or a username looked up first. */
async function toUuid(player: Session, input: string): Promise<string> {
    const value = input.trim();
    if (/^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i.test(value)) return value;
    const found = (await adminRequest(
        { env: player.env },
        "GET",
        `/players/by-username/${encodeURIComponent(value)}`,
    )) as { id: string };
    return found.id;
}

/** A write that refreshes everything this identity has loaded. */
function useChatMutation<T>(base: QueryKey, run: (input: T) => Promise<unknown>) {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: run,
        onSettled: () => queryClient.invalidateQueries({ queryKey: base }),
    });
}

/** A cursor-paged list with "Load more". */
function useCursorList<T>(player: Session, key: QueryKey, path: string) {
    return useInfiniteQuery({
        queryKey: [...key, path],
        queryFn: ({ pageParam }) =>
            adminRequest(
                player,
                "GET",
                `${path}${path.includes("?") ? "&" : "?"}limit=50${pageParam ? `&cursor=${encodeURIComponent(pageParam)}` : ""}`,
            ) as Promise<CursorPage<T>>,
        initialPageParam: "",
        getNextPageParam: (last) => last.cursor ?? undefined,
        enabled: true,
    });
}

function MoreButton({ list }: { list: { hasNextPage: boolean; isFetchingNextPage: boolean; fetchNextPage: () => unknown } }) {
    if (!list.hasNextPage) return null;
    return (
        <button onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage} className={`${secondaryButton} m-2`}>
            {list.isFetchingNextPage ? "Loading…" : "Load more"}
        </button>
    );
}

function IconButton({ title, onClick, children, danger }: { title: string; onClick: () => void; children: ReactNode; danger?: boolean }) {
    return (
        <button
            type="button"
            title={title}
            onClick={onClick}
            className={`text-gray-500 ${danger ? "hover:text-red-300" : "hover:text-gray-100"}`}
        >
            {children}
        </button>
    );
}

/* ---------- Chats ---------- */

const FILTERS = {
    all: { label: "All chats", query: "" },
    special: { label: "Special Chat", query: "" },
    awaiting: { label: "Special Chat · awaiting a reply", query: "?awaiting_reply=true" },
    answered: { label: "Special Chat · answered", query: "?awaiting_reply=false" },
} as const;
type Filter = keyof typeof FILTERS;

function Chats({
    player,
    identity,
    base,
}: {
    player: Session;
    identity: Identity;
    base: QueryKey;
}) {
    const [filter, setFilter] = useState<Filter>(identity.kind === "target" ? "awaiting" : "all");
    const groups = useCursorList<Group>(player, [...base, "groups"], `/v1/groups${FILTERS[filter].query}`);
    const all = groups.data?.pages.flatMap((page) => page.items) ?? [];
    // `special` has no server-side filter; the awaiting ones already are special.
    const shown = filter === "special" ? all.filter((group) => group.special) : all;
    const name = useNames(player, base, shown.flatMap((group) => group.members));
    const [open, setOpen] = useState<number>();
    const current = shown.find((group) => group.id === open) ?? shown[0];
    const self = identity.kind !== "target";

    return (
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-end gap-3">
                <Field label="Show">
                    <select value={filter} onChange={(event) => setFilter(event.target.value as Filter)} className={inputClass}>
                        {Object.entries(FILTERS).map(([key, f]) => (
                            <option key={key} value={key}>
                                {f.label}
                            </option>
                        ))}
                    </select>
                </Field>
                {self && <NewChat player={player} base={base} onCreated={setOpen} />}
            </div>
            <ErrorBanner error={groups.error} />
            <div className="grid h-[36rem] grid-cols-[18rem_1fr] overflow-hidden rounded-lg bg-gray-800 shadow-xl">
                <div className="overflow-y-auto border-r border-gray-700">
                    {shown.map((group) => (
                        <button
                            key={group.id}
                            onClick={() => setOpen(group.id)}
                            className={`block w-full px-4 py-3 text-left hover:bg-gray-700 ${group.id === current?.id ? "bg-gray-700" : ""}`}
                        >
                            <div className="flex items-center gap-2 font-semibold text-gray-200">
                                <span className="truncate">{groupTitle(group, identity.uuid, name)}</span>
                                {group.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-[#61dafb]" />}
                            </div>
                            <div className="mt-0.5 flex gap-1">
                                {group.kind !== "dm" && <Badge>{group.kind}</Badge>}
                                {group.special && <Badge tone="blue">special</Badge>}
                                {group.awaiting_reply && <Badge tone="amber">awaiting reply</Badge>}
                            </div>
                            <div className="truncate text-sm text-gray-500">
                                {group.last_message
                                    ? `${name(group.last_message.sender)}: ${group.last_message.content}`
                                    : "No messages"}
                            </div>
                        </button>
                    ))}
                    {!groups.isPending && !shown.length && <p className="p-4 text-sm text-gray-500">No chats here.</p>}
                    <MoreButton list={groups} />
                </div>
                {current && (
                    <Conversation
                        key={current.id}
                        player={player}
                        identity={identity}
                        group={current}
                        base={base}
                        name={name}
                    />
                )}
            </div>
        </div>
    );
}

function groupTitle(group: Group, viewer: string, name: (uuid: string) => string) {
    return group.name ?? (group.members.filter((member) => member !== viewer).map(name).join(", ") || "Just you");
}

function NewChat({ player, base, onCreated }: { player: Session; base: QueryKey; onCreated: (id: number) => void }) {
    const [mode, setMode] = useState<"dm" | "group" | null>(null);
    const [title, setTitle] = useState("");
    const [members, setMembers] = useState("");
    const create = useChatMutation(base, async () => {
        const uuids = await Promise.all(members.split(/[\s,]+/).filter(Boolean).map((m) => toUuid(player, m)));
        const group = (
            mode === "dm"
                ? await adminRequest(player, "POST", `/groups/dm/${uuids[0]}`)
                : await adminRequest(player, "POST", "/groups", { name: title.trim(), members: uuids })
        ) as { id: number };
        onCreated(group.id);
        setMode(null);
        setTitle("");
        setMembers("");
    });

    if (!mode) {
        return (
            <div className="flex gap-2">
                <button onClick={() => setMode("dm")} className={secondaryButton}>
                    New DM
                </button>
                <button onClick={() => setMode("group")} className={secondaryButton}>
                    New group
                </button>
            </div>
        );
    }

    return (
        <form
            onSubmit={(event) => {
                event.preventDefault();
                create.mutate(undefined);
            }}
            className="flex flex-wrap items-end gap-2"
        >
            {mode === "group" && (
                <Field label="Group name">
                    <input value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={64} className={inputClass} />
                </Field>
            )}
            <Field label={mode === "dm" ? "Friend (username or UUID)" : "Members, comma separated"}>
                <input value={members} onChange={(e) => setMembers(e.target.value)} required className={inputClass} />
            </Field>
            <button type="submit" disabled={create.isPending} className={primaryButton}>
                {create.isPending ? "Opening…" : mode === "dm" ? "Open DM" : "Create"}
            </button>
            <IconButton title="Cancel" onClick={() => setMode(null)}>
                <X size={16} />
            </IconButton>
            <ErrorBanner error={create.error} />
        </form>
    );
}

const MESSAGE_PAGE = 50;

function Conversation({
    player,
    identity,
    group,
    base,
    name,
}: {
    player: Session;
    identity: Identity;
    group: Group;
    base: QueryKey;
    name: (uuid: string) => string;
}) {
    const queryClient = useQueryClient();
    const [draft, setDraft] = useState("");
    const [editing, setEditing] = useState<{ id: number; content: string } | null>(null);
    const target = identity.kind === "target";
    const viewer = identity.uuid;

    // Newest first, which a reversed column shows bottom-up and pinned to the end.
    const messages = useInfiniteQuery({
        queryKey: [...base, "messages", group.id],
        queryFn: ({ pageParam }) =>
            adminRequest(
                player,
                "GET",
                `/groups/${group.id}/messages?limit=${MESSAGE_PAGE}${pageParam ? `&before=${pageParam}` : ""}`,
            ) as Promise<Message[]>,
        initialPageParam: 0,
        getNextPageParam: (last) => (last.length === MESSAGE_PAGE ? last.at(-1)!.id : undefined),
        enabled: true,
    });
    const list = messages.data?.pages.flat() ?? [];

    const latest = list[0]?.id;
    useEffect(() => {
        if (latest === undefined) return;
        // Clears the unread dot in game too.
        adminRequest(player, "POST", `/groups/${group.id}/read/${latest}`)
            .then(() => queryClient.invalidateQueries({ queryKey: [...base, "groups"] }))
            .catch(() => {});
    }, [latest]);

    const send = useChatMutation(base, (content: string) =>
        adminRequest(player, "POST", `/groups/${group.id}/messages`, {
            content,
            idempotency_key: crypto.randomUUID(),
        }).then(() => setDraft("")),
    );
    const edit = useChatMutation(base, ({ id, content }: { id: number; content: string }) =>
        adminRequest(player, "PATCH", `/groups/${group.id}/messages/${id}`, { content }).then(() => setEditing(null)),
    );
    const remove = useChatMutation(base, (id: number) =>
        adminRequest(player, "DELETE", `/groups/${group.id}/messages/${id}`),
    );

    return (
        <div className="flex min-h-0 flex-col">
            {!target && <GroupHeader player={player} group={group} base={base} name={name} viewer={viewer} />}
            <div className="flex flex-1 flex-col-reverse gap-2 overflow-y-auto p-4">
                {list.map((message) => {
                    const mine = message.sender === viewer;
                    return (
                        <div
                            key={message.id}
                            className={`group max-w-[75%] rounded-lg px-3 py-2 ${
                                mine ? "self-end bg-[#61dafb]/20 text-gray-100" : "self-start bg-gray-700 text-gray-200"
                            }`}
                        >
                            <div className="flex items-center gap-2 text-xs text-gray-400">
                                {name(message.sender)} · {new Date(message.sent_at).toLocaleString()}
                                {message.edited_at && " · edited"}
                                {mine && !target && (
                                    <span className="ml-auto hidden gap-2 group-hover:flex">
                                        <IconButton title="Edit" onClick={() => setEditing({ id: message.id, content: message.content })}>
                                            <Pencil size={12} />
                                        </IconButton>
                                        <IconButton
                                            title="Delete"
                                            danger
                                            onClick={() => confirm("Delete this message?") && remove.mutate(message.id)}
                                        >
                                            <Trash2 size={12} />
                                        </IconButton>
                                    </span>
                                )}
                            </div>
                            {editing?.id === message.id ? (
                                <form
                                    onSubmit={(event) => {
                                        event.preventDefault();
                                        edit.mutate(editing);
                                    }}
                                    className="mt-1 flex gap-2"
                                >
                                    <input
                                        value={editing.content}
                                        onChange={(e) => setEditing({ ...editing, content: e.target.value })}
                                        autoFocus
                                        className={`${inputClass} flex-1 py-1`}
                                    />
                                    <IconButton title="Save" onClick={() => edit.mutate(editing)}>
                                        <Check size={14} />
                                    </IconButton>
                                    <IconButton title="Cancel" onClick={() => setEditing(null)}>
                                        <X size={14} />
                                    </IconButton>
                                </form>
                            ) : (
                                <div className="whitespace-pre-wrap break-words">{message.content}</div>
                            )}
                            {message.session_invite && (
                                <div className="mt-1 text-xs text-gray-400">
                                    World invite · {message.session_invite.status}
                                </div>
                            )}
                        </div>
                    );
                })}
                {messages.hasNextPage && (
                    <button
                        onClick={() => messages.fetchNextPage()}
                        disabled={messages.isFetchingNextPage}
                        className={`${secondaryButton} self-center`}
                    >
                        {messages.isFetchingNextPage ? "Loading…" : "Load older"}
                    </button>
                )}
            </div>
            <ErrorBanner error={messages.error ?? send.error ?? edit.error ?? remove.error} />
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    if (draft.trim()) send.mutate(draft.trim());
                }}
                className="flex gap-2 border-t border-gray-700 p-3"
            >
                <input
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    maxLength={4000}
                    placeholder="Reply…"
                    className={`${inputClass} flex-1`}
                />
                <button type="submit" disabled={!draft.trim() || send.isPending} className={primaryButton}>
                    <Send size={16} />
                    Send
                </button>
            </form>
        </div>
    );
}

/** Rename, members, leave and claim, for whatever the group kind allows. */
function GroupHeader({
    player,
    group,
    base,
    name,
    viewer,
}: {
    player: Session;
    group: Group;
    base: QueryKey;
    name: (uuid: string) => string;
    viewer: string;
}) {
    const [renaming, setRenaming] = useState<string | null>(null);
    const [adding, setAdding] = useState("");
    const editable = group.kind === "group" && !group.special;

    const rename = useChatMutation(base, (title: string) =>
        adminRequest(player, "PATCH", `/v1/groups/${group.id}`, { name: title }).then(() => setRenaming(null)),
    );
    const add = useChatMutation(base, async (input: string) => {
        await adminRequest(player, "POST", `/groups/${group.id}/members/${await toUuid(player, input)}`);
        setAdding("");
    });
    const removeMember = useChatMutation(base, (uuid: string) =>
        adminRequest(player, "DELETE", `/groups/${group.id}/members/${uuid}`),
    );
    const claim = useChatMutation(base, () => adminRequest(player, "POST", `/groups/${group.id}/claim`));

    if (group.kind === "dm") return null;

    return (
        <div className="flex flex-col gap-2 border-b border-gray-700 p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
                {renaming !== null ? (
                    <form
                        onSubmit={(event) => {
                            event.preventDefault();
                            rename.mutate(renaming.trim());
                        }}
                        className="flex gap-2"
                    >
                        <input value={renaming} onChange={(e) => setRenaming(e.target.value)} maxLength={64} autoFocus className={`${inputClass} py-1`} />
                        <IconButton title="Save" onClick={() => rename.mutate(renaming.trim())}>
                            <Check size={14} />
                        </IconButton>
                        <IconButton title="Cancel" onClick={() => setRenaming(null)}>
                            <X size={14} />
                        </IconButton>
                    </form>
                ) : (
                    <span className="font-semibold text-gray-200">{group.name ?? "Unnamed"}</span>
                )}
                {editable && renaming === null && (
                    <IconButton title="Rename" onClick={() => setRenaming(group.name ?? "")}>
                        <Pencil size={14} />
                    </IconButton>
                )}
                <span className="ml-auto flex gap-2">
                    {group.special && (
                        <button onClick={() => confirm("Convert this Special Chat into a normal group chat owned by this account? A new Special Chat is made the next time someone messages it.") && claim.mutate(undefined)} className={secondaryButton}>
                            Convert to normal chat
                        </button>
                    )}
                    {editable && (
                        <button
                            onClick={() => confirm("Leave this group?") && removeMember.mutate(viewer)}
                            className={secondaryButton}
                        >
                            <LogOut size={14} />
                            Leave
                        </button>
                    )}
                </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
                {group.members.map((member) => (
                    <span key={member} className="flex items-center gap-1 rounded bg-gray-700 px-2 py-0.5">
                        {name(member)}
                        {editable && member !== viewer && (
                            <IconButton title="Remove" danger onClick={() => removeMember.mutate(member)}>
                                <UserMinus size={12} />
                            </IconButton>
                        )}
                    </span>
                ))}
                {editable && (
                    <form
                        onSubmit={(event) => {
                            event.preventDefault();
                            if (adding.trim()) add.mutate(adding);
                        }}
                        className="flex items-center gap-1"
                    >
                        <input
                            value={adding}
                            onChange={(e) => setAdding(e.target.value)}
                            placeholder="Add member…"
                            className={`${inputClass} w-36 py-0.5 text-xs`}
                        />
                        <IconButton title="Add" onClick={() => adding.trim() && add.mutate(adding)}>
                            <UserPlus size={14} />
                        </IconButton>
                    </form>
                )}
            </div>
            <ErrorBanner error={rename.error ?? add.error ?? removeMember.error ?? claim.error} />
        </div>
    );
}

/* ---------- Friends, requests, blocks ---------- */

function PlayerRows({ children, empty }: { children: ReactNode; empty: boolean }) {
    return (
        <ul className="flex flex-col divide-y divide-gray-700/60 rounded-lg bg-gray-800 shadow-xl">
            {empty && <li className="px-4 py-3 text-sm text-gray-500">Nobody here.</li>}
            {children}
        </ul>
    );
}

function Friends({ player, base, onOpen }: { player: Session; base: QueryKey; onOpen: () => void }) {
    const friends = useCursorList<Friend>(player, base, "/v1/social/friends");
    const items = friends.data?.pages.flatMap((page) => page.items) ?? [];
    const name = useNames(player, base, items.map((friend) => friend.player));
    const [lookup, setLookup] = useState("");

    const unfriend = useChatMutation(base, (uuid: string) => adminRequest(player, "DELETE", `/social/friends/${uuid}`));
    const block = useChatMutation(base, (uuid: string) => adminRequest(player, "POST", `/social/blocked/${uuid}`));
    const dm = useChatMutation(base, async (uuid: string) => {
        await adminRequest(player, "POST", `/groups/dm/${uuid}`);
        onOpen();
    });
    const relationship = useMutation({
        mutationFn: async () => {
            const uuid = await toUuid(player, lookup);
            const result = (await adminRequest(player, "GET", `/v1/social/relationship/${uuid}`)) as {
                relationship: string;
                request_id: number | null;
            };
            return { uuid, ...result };
        },
    });

    return (
        <Panel title="Friends" description="Your friends, newest first. Removing ends the friendship; blocking also cancels pending requests.">
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    relationship.mutate();
                }}
                className="flex flex-wrap items-end gap-3"
            >
                <Field label="Look up a relationship" help="Username or UUID">
                    <input value={lookup} onChange={(e) => setLookup(e.target.value)} required className={inputClass} />
                </Field>
                <button type="submit" disabled={relationship.isPending} className={secondaryButton}>
                    Check
                </button>
                {relationship.data && (
                    <span className="text-sm text-gray-300">
                        <span className="font-mono text-xs text-gray-500">{relationship.data.uuid}</span>:{" "}
                        {relationship.data.relationship.replaceAll("_", " ")}
                    </span>
                )}
            </form>
            <ErrorBanner error={friends.error ?? relationship.error ?? unfriend.error ?? block.error ?? dm.error} />
            <PlayerRows empty={!friends.isPending && !items.length}>
                {items.map((friend) => (
                    <li key={friend.player} className="flex items-center gap-3 px-4 py-2 text-sm">
                        <span className={`h-2 w-2 rounded-full ${friend.online ? "bg-green-400" : "bg-gray-600"}`} />
                        <span className="text-gray-200">{name(friend.player)}</span>
                        {friend.kind !== "friend" && <Badge tone="blue">{friend.kind.replaceAll("_", " ")}</Badge>}
                        <span className="flex-1 text-xs text-gray-500">since {new Date(friend.since).toLocaleDateString()}</span>
                        <IconButton title="Message" onClick={() => dm.mutate(friend.player)}>
                            <MessagesSquare size={16} />
                        </IconButton>
                        <IconButton title="Remove friend" danger onClick={() => confirm(`Unfriend ${name(friend.player)}?`) && unfriend.mutate(friend.player)}>
                            <UserMinus size={16} />
                        </IconButton>
                        <IconButton title="Block" danger onClick={() => confirm(`Block ${name(friend.player)}?`) && block.mutate(friend.player)}>
                            <Ban size={16} />
                        </IconButton>
                    </li>
                ))}
                <MoreButton list={friends} />
            </PlayerRows>
        </Panel>
    );
}

function RequestCount({ player, base }: { player: Session; base: QueryKey }) {
    const counts = useQuery({
        queryKey: [...base, "request-counts"],
        queryFn: () => adminRequest(player, "GET", "/v1/social/requests/counts") as Promise<{ incoming: number; outgoing: number }>,
        enabled: true,
    });
    return counts.data?.incoming ? <span className="ml-1 text-xs text-amber-300">({counts.data.incoming})</span> : null;
}

function Requests({ player, base }: { player: Session; base: QueryKey }) {
    const incoming = useCursorList<FriendRequest>(player, base, "/v1/social/requests/incoming");
    const outgoing = useCursorList<FriendRequest>(player, base, "/v1/social/requests/outgoing");
    const inItems = incoming.data?.pages.flatMap((page) => page.items) ?? [];
    const outItems = outgoing.data?.pages.flatMap((page) => page.items) ?? [];
    const name = useNames(player, base, [...inItems, ...outItems].map((request) => request.player));
    const [to, setTo] = useState("");

    const sendRequest = useChatMutation(base, async (input: string) => {
        await adminRequest(player, "POST", `/social/requests/${await toUuid(player, input)}`);
        setTo("");
    });
    const act = useChatMutation(base, ({ id, action }: { id: number; action: "accept" | "decline" | "cancel" }) =>
        action === "cancel"
            ? adminRequest(player, "DELETE", `/social/requests/${id}`)
            : adminRequest(player, "POST", `/social/requests/${id}/${action}`),
    );

    return (
        <Panel title="Friend requests" description="Pending requests both ways. Sending one to a player who already asked you accepts theirs.">
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    sendRequest.mutate(to);
                }}
                className="flex flex-wrap items-end gap-3"
            >
                <Field label="Send a request" help="Username or UUID">
                    <input value={to} onChange={(e) => setTo(e.target.value)} required className={inputClass} />
                </Field>
                <button type="submit" disabled={sendRequest.isPending} className={primaryButton}>
                    <UserPlus size={16} />
                    Send
                </button>
            </form>
            <ErrorBanner error={incoming.error ?? outgoing.error ?? sendRequest.error ?? act.error} />
            <div className="grid gap-4 md:grid-cols-2">
                <div className="flex flex-col gap-2">
                    <div className="font-semibold text-gray-300">Incoming</div>
                    <PlayerRows empty={!incoming.isPending && !inItems.length}>
                        {inItems.map((request) => (
                            <li key={request.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                                <span className="flex-1 text-gray-200">{name(request.player)}</span>
                                <IconButton title="Accept" onClick={() => act.mutate({ id: request.id, action: "accept" })}>
                                    <Check size={16} />
                                </IconButton>
                                <IconButton title="Decline" danger onClick={() => act.mutate({ id: request.id, action: "decline" })}>
                                    <X size={16} />
                                </IconButton>
                            </li>
                        ))}
                        <MoreButton list={incoming} />
                    </PlayerRows>
                </div>
                <div className="flex flex-col gap-2">
                    <div className="font-semibold text-gray-300">Outgoing</div>
                    <PlayerRows empty={!outgoing.isPending && !outItems.length}>
                        {outItems.map((request) => (
                            <li key={request.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                                <span className="flex-1 text-gray-200">{name(request.player)}</span>
                                <span className="text-xs text-gray-500">{new Date(request.created_at).toLocaleDateString()}</span>
                                <IconButton title="Cancel" danger onClick={() => act.mutate({ id: request.id, action: "cancel" })}>
                                    <X size={16} />
                                </IconButton>
                            </li>
                        ))}
                        <MoreButton list={outgoing} />
                    </PlayerRows>
                </div>
            </div>
        </Panel>
    );
}

function BlockedList({ player, base }: { player: Session; base: QueryKey }) {
    const blocked = useCursorList<Blocked>(player, base, "/v1/social/blocked");
    const items = blocked.data?.pages.flatMap((page) => page.items) ?? [];
    const name = useNames(player, base, items.map((entry) => entry.player));
    const [who, setWho] = useState("");

    const block = useChatMutation(base, async (input: string) => {
        await adminRequest(player, "POST", `/social/blocked/${await toUuid(player, input)}`);
        setWho("");
    });
    const unblock = useChatMutation(base, (uuid: string) => adminRequest(player, "DELETE", `/social/blocked/${uuid}`));

    return (
        <Panel title="Blocked" description="Blocked players can't message, friend or invite you. Blocking ends any friendship.">
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    if (confirm(`Block ${who.trim()}?`)) block.mutate(who);
                }}
                className="flex flex-wrap items-end gap-3"
            >
                <Field label="Block a player" help="Username or UUID">
                    <input value={who} onChange={(e) => setWho(e.target.value)} required className={inputClass} />
                </Field>
                <button type="submit" disabled={block.isPending} className={secondaryButton}>
                    <Ban size={16} />
                    Block
                </button>
            </form>
            <ErrorBanner error={blocked.error ?? block.error ?? unblock.error} />
            <PlayerRows empty={!blocked.isPending && !items.length}>
                {items.map((entry) => (
                    <li key={entry.player} className="flex items-center gap-3 px-4 py-2 text-sm">
                        <span className="flex-1 text-gray-200">{name(entry.player)}</span>
                        <span className="text-xs text-gray-500">since {new Date(entry.since).toLocaleDateString()}</span>
                        <button onClick={() => unblock.mutate(entry.player)} className={secondaryButton}>
                            Unblock
                        </button>
                    </li>
                ))}
                <MoreButton list={blocked} />
            </PlayerRows>
        </Panel>
    );
}

/* ---------- Raw console ---------- */

function RawConsole({ open, log, onSend }: { open: boolean; log: string[]; onSend: (data: string) => void }) {
    const [draft, setDraft] = useState('{"type":"GetActiveCosmetics","players":[]}');
    let valid = true;
    try {
        JSON.parse(draft);
    } catch {
        valid = false;
    }

    return (
        <div className="flex flex-col gap-3">
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    onSend(draft);
                }}
                className="flex gap-2"
            >
                <input value={draft} onChange={(event) => setDraft(event.target.value)} className={`${inputClass} flex-1 font-mono text-sm`} />
                <button type="submit" disabled={!open || !valid} className={primaryButton}>
                    <Send size={16} />
                    Send
                </button>
            </form>
            <pre className="h-64 overflow-auto rounded-lg bg-gray-900 p-3 font-mono text-xs text-gray-400">
                {log.join("\n") || "Nothing yet."}
            </pre>
        </div>
    );
}
