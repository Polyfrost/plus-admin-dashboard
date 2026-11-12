import { createFileRoute } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { Plus, Shield, UserPlus } from "lucide-react";
import { adminRequest, useAdminMutation, useAdminQuery } from "@/lib/store-api";
import { useSession, type Role } from "@/lib/session";
import { toHex } from "@/lib/permissions";
import {
    DeleteButton,
    PermissionPicker,
    ErrorBanner,
    Field,
    Panel,
    inputClass,
    primaryButton,
    secondaryButton,
} from "@/components/store/shared";

export const Route = createFileRoute("/roles")({
    component: Roles,
});

interface Member {
    id: string;
    username: string | null;
}

const BLANK: Role = { id: 0, name: "", color: null, position: 0, permissions: "0" };

function Roles() {
    const roles = useAdminQuery<Role[]>("/v1/roles");
    const [selected, setSelected] = useState<Role>();

    return (
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 p-6">
            <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-100">
                <Shield size={22} className="text-[#61dafb]" />
                Roles
            </h1>
            <ErrorBanner error={roles.error} />

            <div className="grid gap-6 md:grid-cols-[16rem_1fr]">
                <div className="flex flex-col gap-1">
                    <button
                        onClick={() => setSelected(BLANK)}
                        className={`${secondaryButton} mb-2`}
                    >
                        <Plus size={14} />
                        New role
                    </button>
                    {roles.data?.map((role) => (
                        <button
                            key={role.id}
                            onClick={() => setSelected(role)}
                            className={`flex items-center gap-2 rounded px-3 py-2 text-left text-sm ${
                                selected?.id === role.id
                                    ? "bg-gray-700 text-gray-100"
                                    : "text-gray-300 hover:bg-gray-800"
                            }`}
                        >
                            <span
                                className="size-3 shrink-0 rounded-full border border-gray-600"
                                style={{
                                    background:
                                        role.color === null ? "transparent" : toHex(role.color),
                                }}
                            />
                            <span className="flex-1 truncate">{role.name}</span>
                            <span className="text-xs text-gray-500">{role.position}</span>
                        </button>
                    ))}
                </div>

                {selected && (
                    <div className="flex flex-col gap-8">
                        <RoleEditor
                            key={selected.id}
                            role={selected}
                            onSaved={setSelected}
                            onDeleted={() => setSelected(undefined)}
                        />
                        {selected.id !== 0 && <Members role={selected} />}
                    </div>
                )}
            </div>
        </div>
    );
}

function RoleEditor({
    role,
    onSaved,
    onDeleted,
}: {
    role: Role;
    onSaved: (role: Role) => void;
    onDeleted: () => void;
}) {
    const [name, setName] = useState(role.name);
    const [color, setColor] = useState(role.color);
    const [position, setPosition] = useState(role.position);
    const [flags, setFlags] = useState(BigInt(role.permissions));
    const isNew = role.id === 0;

    const save = useAdminMutation(() => ({
        method: isNew ? "POST" : "PUT",
        path: isNew ? "/v1/roles" : `/v1/roles/${role.id}`,
        body: { name, color, position, permissions: flags.toString() },
    }));
    const remove = useAdminMutation(() => ({
        method: "DELETE",
        path: `/v1/roles/${role.id}`,
    }));

    function onSubmit(event: FormEvent) {
        event.preventDefault();
        save.mutate(undefined, { onSuccess: (saved) => onSaved(saved as Role) });
    }

    return (
        <Panel
            title={isNew ? "New role" : role.name}
            description="Players hold every flag of every role they have. The highest coloured role is their display colour, in game too. Unless you are an administrator, you can only manage roles below your highest one, and only with flags you hold."
        >
            <form onSubmit={onSubmit} className="flex flex-col gap-4">
                <div className="flex flex-wrap items-end gap-3">
                    <Field label="Name">
                        <input
                            value={name}
                            onChange={(event) => setName(event.target.value)}
                            required
                            maxLength={64}
                            className={inputClass}
                        />
                    </Field>
                    <Field label="Position" help="Higher outranks lower.">
                        <input
                            type="number"
                            value={position}
                            onChange={(event) => setPosition(Number(event.target.value))}
                            className={inputClass}
                        />
                    </Field>
                    <Field label="Colour">
                        <div className="flex items-center gap-2">
                            <input
                                type="color"
                                value={toHex(color ?? 0x99aab5)}
                                disabled={color === null}
                                onChange={(event) =>
                                    setColor(parseInt(event.target.value.slice(1), 16))
                                }
                                className="h-10 w-14 cursor-pointer rounded border border-gray-600 bg-gray-700 disabled:opacity-30"
                            />
                            <label className="flex items-center gap-1 text-xs">
                                <input
                                    type="checkbox"
                                    checked={color === null}
                                    onChange={(event) =>
                                        setColor(event.target.checked ? null : 0x99aab5)
                                    }
                                />
                                None
                            </label>
                        </div>
                    </Field>
                </div>

                <PermissionPicker flags={flags} onChange={setFlags} />

                <div className="flex items-center gap-4">
                    <button type="submit" disabled={save.isPending} className={primaryButton}>
                        {isNew ? "Create role" : "Save"}
                    </button>
                    {!isNew && (
                        <DeleteButton
                            pending={remove.isPending}
                            onDelete={() => {
                                if (confirm(`Delete ${role.name}? Everyone holding it loses it.`)) {
                                    remove.mutate(undefined, { onSuccess: onDeleted });
                                }
                            }}
                        />
                    )}
                </div>
                <ErrorBanner error={save.error ?? remove.error} />
            </form>
        </Panel>
    );
}

const UUID = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;

function Members({ role }: { role: Role }) {
    const session = useSession();
    const members = useAdminQuery<Member[]>(`/v1/roles/${role.id}/members`);
    const [player, setPlayer] = useState("");

    const assign = useAdminMutation(async (input: string) => {
        // Accept a UUID as is; otherwise resolve the username, and have the
        // manager confirm who it resolved to before they get any permissions.
        let uuid = input;
        if (!UUID.test(input)) {
            const found = (await adminRequest(
                session,
                "GET",
                `/players/by-username/${encodeURIComponent(input)}`,
            )) as { id: string; username: string };
            if (!confirm(`Give ${role.name} to ${found.username} (${found.id})?`)) {
                throw new Error("Cancelled.");
            }
            uuid = found.id;
        }
        return { method: "PUT", path: `/v1/players/${uuid}/roles/${role.id}` };
    });
    const unassign = useAdminMutation((uuid: string) => ({
        method: "DELETE",
        path: `/v1/players/${uuid}/roles/${role.id}`,
    }));

    return (
        <Panel title="Members" description="Players holding this role.">
            <form
                onSubmit={(event) => {
                    event.preventDefault();
                    assign.mutate(player.trim(), { onSuccess: () => setPlayer("") });
                }}
                className="flex flex-wrap items-end gap-3"
            >
                <Field label="Username or UUID">
                    <input
                        value={player}
                        onChange={(event) => setPlayer(event.target.value)}
                        required
                        className={inputClass}
                    />
                </Field>
                <button
                    type="submit"
                    disabled={!player.trim() || assign.isPending}
                    className={primaryButton}
                >
                    <UserPlus size={16} />
                    Add
                </button>
            </form>
            <ErrorBanner error={members.error ?? assign.error ?? unassign.error} />

            <ul className="flex flex-col divide-y divide-gray-800 rounded border border-gray-800">
                {members.data?.length === 0 && (
                    <li className="px-4 py-3 text-sm text-gray-500">Nobody yet.</li>
                )}
                {members.data?.map((member) => (
                    <li key={member.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                        <span className="text-gray-200">{member.username ?? "Unknown"}</span>
                        <span className="flex-1 font-mono text-xs text-gray-500">{member.id}</span>
                        <DeleteButton
                            pending={unassign.isPending}
                            onDelete={() => unassign.mutate(member.id)}
                        />
                    </li>
                ))}
            </ul>
        </Panel>
    );
}
