import {
    createRootRouteWithContext,
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
