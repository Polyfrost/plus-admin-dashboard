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
import { LogOut } from "lucide-react";
import { ENV_OPTIONS, signOut, useSession } from "@/lib/session";
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
    const session = useSession();

    if (!session) {
        return (
            <>
                <SignIn />
                <DevTools />
            </>
        );
    }

    const envLabel =
        ENV_OPTIONS.find((option) => option.value === session.env)?.label ??
        session.env;

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
                        <Link
                            to="/"
                            className="text-gray-400 hover:text-gray-100 [&.active]:text-[#61dafb]"
                        >
                            Dashboard
                        </Link>
                        <Link
                            to="/analytics"
                            className="text-gray-400 hover:text-gray-100 [&.active]:text-[#61dafb]"
                        >
                            Analytics
                        </Link>
                        <Link
                            to="/links"
                            className="text-gray-400 hover:text-gray-100 [&.active]:text-[#61dafb]"
                        >
                            Links
                        </Link>
                        <Link
                            to="/store"
                            className="text-gray-400 hover:text-gray-100 [&.active]:text-[#61dafb]"
                        >
                            Store
                        </Link>
                        <div className="ml-auto flex items-center gap-3">
                            <span className="text-sm text-gray-500">
                                {envLabel}
                            </span>
                            <button
                                onClick={signOut}
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
