import {
    createRootRouteWithContext,
    Link,
    Outlet,
    useRouter,
    type NavigateOptions,
    type ToOptions,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { TanStackDevtools } from "@tanstack/react-devtools";
import { ReactQueryDevtoolsPanel } from "@tanstack/react-query-devtools";
import type { QueryClient } from "@tanstack/react-query";
import { RouterProvider } from "react-aria-components";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { LoaderCircle, LogOut } from "lucide-react";
import { ENV_OPTIONS, meKey, signOut, useMe, useSession } from "@/lib/session";
import { finishMicrosoftSignIn, isMicrosoftCallback } from "@/lib/microsoft";
import { PAGES, hasAny } from "@/lib/permissions";
import { SignIn } from "@/components/SignIn";

interface AppRouterContext {
    queryClient: QueryClient;
}

declare module "react-aria-components" {
    interface RouterConfig {
        href: ToOptions["to"];
        routerOptions: Omit<NavigateOptions, keyof ToOptions>;
    }
}

export const Route = createRootRouteWithContext<AppRouterContext>()({
    component: RootRoute,
});

function RootRoute() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const session = useSession();
    const me = useMe();
    // Microsoft redirected back here: finish signing in before asking /me.
    const [callback, setCallback] = useState(isMicrosoftCallback);
    const [signInError, setSignInError] = useState<string | null>(null);

    useEffect(() => {
        if (!callback) return;
        void finishMicrosoftSignIn().then(async (error) => {
            setSignInError(error);
            await queryClient.invalidateQueries({ queryKey: meKey(session.env) });
            setCallback(false);
        });
    }, [callback, queryClient, session.env]);

    if (callback || me.isPending) {
        return (
            <div className="flex min-h-screen items-center justify-center text-gray-400">
                <LoaderCircle size={24} className="animate-spin" />
            </div>
        );
    }

    if (!me.data) {
        return (
            <>
                <SignIn
                    key={signInError}
                    error={signInError ?? (me.error && me.error.message)}
                />
                <DevTools />
            </>
        );
    }

    const envLabel =
        ENV_OPTIONS.find((option) => option.value === session.env)?.label ??
        session.env;
    const permissions = me.data.permissions;

    return (
        <>
            <RouterProvider
                navigate={(to, options) => router.navigate({ to, ...options })}
                useHref={(to) => router.buildLocation({ to }).href}
            >
                <div className="min-h-screen flex flex-col text-fg-primary">
                    <nav className="flex items-center gap-4 px-6 py-3 bg-gray-900 border-b border-gray-800">
                        <span className="font-bold text-gray-100">
                            Plus Admin
                        </span>
                        {PAGES.filter((page) => hasAny(permissions, page.perm)).map(
                            (page) => (
                                <Link
                                    key={page.to}
                                    to={page.to}
                                    className="text-gray-400 hover:text-gray-100 [&.active]:text-[#61dafb]"
                                >
                                    {page.label}
                                </Link>
                            ),
                        )}
                        <div className="ml-auto flex items-center gap-3">
                            <span className="text-sm text-gray-500">
                                {me.data.username ?? me.data.id.slice(0, 8)} · {envLabel}
                            </span>
                            <button
                                onClick={async () => {
                                    await signOut(session).catch(() => {});
                                    queryClient.setQueryData(meKey(session.env), null);
                                }}
                                className="flex items-center gap-1 text-sm text-gray-400 hover:text-gray-100"
                            >
                                <LogOut size={14} />
                                Sign out
                            </button>
                        </div>
                    </nav>
                    <Outlet />
                </div>
            </RouterProvider>
            <DevTools />
        </>
    );
}

function DevTools() {
    return (
        <TanStackDevtools
            config={{
                position: "bottom-left",
            }}
            plugins={[
                {
                    name: "Tanstack Query",
                    render: <ReactQueryDevtoolsPanel />,
                },
                {
                    name: "Tanstack Router",
                    render: <TanStackRouterDevtoolsPanel />,
                },
            ]}
        />
    );
}
