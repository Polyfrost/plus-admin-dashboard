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
