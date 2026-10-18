import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MessagesSquare, Send } from "lucide-react";
import { adminRequest, useAdminQuery } from "@/lib/store-api";
import { useRequiredSession, type Session } from "@/lib/session";
import {
    Badge,
    ErrorBanner,
    Panel,
    inputClass,
    primaryButton,
} from "@/components/store/shared";

export const Route = createFileRoute("/chat")({
    component: Chat,
});

interface Target {
    uuid: string;
    username: string | null;
}

interface Group {
    id: number;
    members: string[];
    last_message: { content: string; sender: string } | null;
    unread: boolean;
    special: boolean;
}

interface Message {
    id: number;
    sender: string;
    content: string;
    sent_at: string;
    edited_at: string | null;
}

interface Packet {
    type: string;
    [key: string]: unknown;
}

function Chat() {
    const session = useRequiredSession();
    const queryClient = useQueryClient();
    const targets = useAdminQuery<Target[]>("/v1/admin/special-chat/targets");
    const [picked, setPicked] = useState<string>();
    const target = picked ?? targets.data?.[0]?.uuid;

    // A player token for the recipient, renewed well inside its 2h life.
    const token = useQuery({
        queryKey: ["chat-token", session.env, target],
        queryFn: () =>
            adminRequest(session, "POST", "/v1/admin/special-chat/token", {
                uuid: target,
            }) as Promise<{ token: string }>,
        enabled: !!target,
        staleTime: Infinity,
        refetchInterval: 90 * 60_000,
    });
    // adminRequest sends `password` as the Authorization header verbatim.
    const player: Session | undefined = token.data && {
        env: session.env,
        password: `Bearer ${token.data.token}`,
    };
    const chatKey = ["chat", session.env, target];

    const [log, setLog] = useState<string[]>([]);
    const socket = useSocket(session.env, token.data?.token, (packet) => {
        setLog((log) =>
            [`← ${JSON.stringify(packet)}`, ...log].slice(0, 100),
        );
        if (packet.type.startsWith("GroupMessage")) {
            queryClient.invalidateQueries({ queryKey: chatKey });
        }
    });

    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
            <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-100">
                <MessagesSquare size={22} className="text-[#61dafb]" />
                Special Chat
            </h1>
            <Panel
                title="Answer as a recipient"
                description="Reads and replies to Special Chat as one of the configured recipients, live over the websocket. Players see replies as coming from that recipient's account."
            >
                <div className="flex items-center gap-3">
                    <select
                        value={target ?? ""}
                        onChange={(event) => setPicked(event.target.value)}
                        className={inputClass}
                    >
                        {targets.data?.map((t) => (
                            <option key={t.uuid} value={t.uuid}>
                                {t.username ?? t.uuid}
                            </option>
                        ))}
                    </select>
                    <Badge tone={socket.state === "open" ? "green" : undefined}>
                        websocket {socket.state}
                    </Badge>
                </div>
                <ErrorBanner error={targets.error ?? token.error} />
                {!targets.isPending && !targets.data?.length && (
                    <p className="text-sm text-gray-500">
                        No recipients configured on this backend.
                    </p>
                )}
                {player && target && (
                    <Inbox player={player} target={target} chatKey={chatKey} />
                )}
            </Panel>
            {player && (
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
        </div>
    );
}

/** Keeps a websocket open while there is a token, reconnecting when it drops. */
function useSocket(
    env: string,
    token: string | undefined,
    onPacket: (packet: Packet) => void,
) {
    const [state, setState] = useState<"connecting" | "open" | "closed">(
        "closed",
    );
    const socket = useRef<WebSocket | null>(null);
    const handler = useRef(onPacket);
    handler.current = onPacket;

    useEffect(() => {
        if (!token) return;
        let stopped = false;
        let retry: number | undefined;

        const connect = () => {
            setState("connecting");
            // Browsers can't set Authorization here; the backend reads it from the subprotocol.
            const ws = new WebSocket(
                `${env.replace(/^http/, "ws")}/websocket`,
                ["bearer", token],
            );
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
    }, [env, token]);

    return { state, send: (data: string) => socket.current?.send(data) };
}

function Inbox({
    player,
    target,
    chatKey,
}: {
    player: Session;
    target: string;
    chatKey: unknown[];
}) {
    const groups = useQuery({
        queryKey: [...chatKey, "groups"],
        queryFn: async () =>
            ((await adminRequest(player, "GET", "/groups")) as Group[])
                .filter((group) => group.special)
                .sort((a, b) => Number(b.unread) - Number(a.unread)),
        enabled: true,
    });

    const ids = [...new Set(groups.data?.flatMap((group) => group.members))];
    const names = useQuery({
        queryKey: [...chatKey, "names", ids.join()],
        queryFn: async () => {
            const { players } = (await adminRequest(
                player,
                "POST",
                "/players/resolve",
                { ids },
            )) as { players: { id: string; username: string }[] };
            return new Map(players.map((p) => [p.id, p.username]));
        },
        enabled: ids.length > 0,
        staleTime: Infinity,
    });
    const name = (uuid: string) => names.data?.get(uuid) ?? uuid.slice(0, 8);

    const [open, setOpen] = useState<number>();
    const groupId = open ?? groups.data?.[0]?.id;

    return (
        <div className="flex flex-col gap-3">
            <ErrorBanner error={groups.error} />
            <div className="grid h-[32rem] grid-cols-[16rem_1fr] overflow-hidden rounded-lg bg-gray-800 shadow-xl">
                <div className="overflow-y-auto border-r border-gray-700">
                    {groups.data?.map((group) => (
                        <button
                            key={group.id}
                            onClick={() => setOpen(group.id)}
                            className={`block w-full px-4 py-3 text-left hover:bg-gray-700 ${
                                group.id === groupId ? "bg-gray-700" : ""
                            }`}
                        >
                            <div className="flex items-center gap-2 font-semibold text-gray-200">
                                {group.members
                                    .filter((member) => member !== target)
                                    .map(name)
                                    .join(", ")}
                                {group.unread && (
                                    <span className="h-2 w-2 rounded-full bg-[#61dafb]" />
                                )}
                            </div>
                            <div className="truncate text-sm text-gray-500">
                                {group.last_message?.content ?? "No messages"}
                            </div>
                        </button>
                    ))}
                    {groups.data?.length === 0 && (
                        <p className="p-4 text-sm text-gray-500">
                            Nobody has opened Special Chat yet.
                        </p>
                    )}
                </div>
                {groupId !== undefined && (
                    <Conversation
                        key={groupId}
                        player={player}
                        target={target}
                        groupId={groupId}
                        chatKey={chatKey}
                        name={name}
                    />
                )}
            </div>
        </div>
    );
}

function Conversation({
    player,
    target,
    groupId,
    chatKey,
    name,
}: {
    player: Session;
    target: string;
    groupId: number;
    chatKey: unknown[];
    name: (uuid: string) => string;
}) {
    const queryClient = useQueryClient();
    const [draft, setDraft] = useState("");

    // Newest first, which a reversed column shows bottom-up and pinned to the end.
    const messages = useQuery({
        queryKey: [...chatKey, "messages", groupId],
        queryFn: () =>
            adminRequest(
                player,
                "GET",
                `/groups/${groupId}/messages?limit=100`,
            ) as Promise<Message[]>,
        enabled: true,
    });

    const latest = messages.data?.[0]?.id;
    useEffect(() => {
        if (latest === undefined) return;
        // Clears the unread dot in game too.
        adminRequest(player, "POST", `/groups/${groupId}/read/${latest}`)
            .then(() =>
                queryClient.invalidateQueries({ queryKey: [...chatKey, "groups"] }),
            )
            .catch(() => {});
    }, [latest]);

    const send = useMutation({
        mutationFn: (content: string) =>
            adminRequest(player, "POST", `/groups/${groupId}/messages`, {
                content,
                idempotency_key: crypto.randomUUID(),
            }),
        onSuccess: () => setDraft(""),
        onSettled: () => queryClient.invalidateQueries({ queryKey: chatKey }),
    });

    return (
        <div className="flex min-h-0 flex-col">
            <div className="flex flex-1 flex-col-reverse gap-2 overflow-y-auto p-4">
                {messages.data?.map((message) => {
                    const mine = message.sender === target;
                    return (
                        <div
                            key={message.id}
                            className={`max-w-[75%] rounded-lg px-3 py-2 ${
                                mine
                                    ? "self-end bg-[#61dafb]/20 text-gray-100"
                                    : "self-start bg-gray-700 text-gray-200"
                            }`}
                        >
                            <div className="text-xs text-gray-400">
                                {name(message.sender)} ·{" "}
                                {new Date(message.sent_at).toLocaleString()}
                                {message.edited_at && " · edited"}
                            </div>
                            <div className="whitespace-pre-wrap break-words">
                                {message.content}
                            </div>
                        </div>
                    );
                })}
            </div>
            <ErrorBanner error={messages.error ?? send.error} />
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
                <button
                    type="submit"
                    disabled={!draft.trim() || send.isPending}
                    className={primaryButton}
                >
                    <Send size={16} />
                    Send
                </button>
            </form>
        </div>
    );
}

function RawConsole({
    open,
    log,
    onSend,
}: {
    open: boolean;
    log: string[];
    onSend: (data: string) => void;
}) {
    const [draft, setDraft] = useState(
        '{"type":"GetActiveCosmetics","players":[]}',
    );
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
                <input
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    className={`${inputClass} flex-1 font-mono text-sm`}
                />
                <button
                    type="submit"
                    disabled={!open || !valid}
                    className={primaryButton}
                >
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
