import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
    createHashHistory,
    createRouter,
    RouterProvider,
} from "@tanstack/react-router";
import { StrictMode } from "react";
import ReactDOM from "react-dom/client";

// Import the generated route tree
import { routeTree } from "./routeTree.gen";

import "./styles.css";

// Tanstack Query Client
const queryClient = new QueryClient({
    defaultOptions: {
        queries: {
            retry: false,
            enabled: false,
            staleTime: 1000 * 60 * 1, // 1 minute
        },
    },
});

const hashHistory = createHashHistory();

// Tanstack Router
const router = createRouter({
    routeTree,
    context: {
        queryClient,
    },
    history: hashHistory,
    defaultPreload: "intent",
    scrollRestoration: true,
    defaultStructuralSharing: true,
    defaultPreloadStaleTime: 0,
    defaultNotFoundComponent: () => <div>Not Found</div>,
});

// Register the router instance for type safety
declare module "@tanstack/react-router" {
    interface Register {
        router: typeof router;
    }
}

// Render the app
const rootElement = document.getElementById("app");
if (rootElement && !rootElement.innerHTML) {
    const root = ReactDOM.createRoot(rootElement);
    root.render(
        <StrictMode>
            <QueryClientProvider client={queryClient}>
                <RouterProvider router={router} />
            </QueryClientProvider>
        </StrictMode>,
    );
}
