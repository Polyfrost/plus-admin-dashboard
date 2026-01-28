import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/")({
    component: Dashboard,
});

interface Cape {
    id: number;
    type: string;
    url?: string;
    hash: string;
}

function Dashboard() {
    const [password, setPassword] = useState("");
    const [env, setEnv] = useState("https://plus-staging.polyfrost.org");
    const [file, setFile] = useState<File | null>(null);
    const [message, setMessage] = useState("");
    const [capes, setCapes] = useState<Cape[]>([]);

    const handleUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!password || !file) {
            setMessage("Please fill in all fields.");
            return;
        }

        setMessage("Uploading...");
        const formData = new FormData();
        formData.append("file", file);

        try {
            const res = await fetch(`${env}/cosmetics/cape`, {
                method: "POST",
                headers: {
                    Authorization: password,
                },
                body: formData,
            });

            if (res.ok) {
                const data = await res.json();
                setMessage(`Cape uploaded successfully! ID: ${data.id}`);
            } else {
                const text = await res.text();
                setMessage(`Error: ${res.status} ${text}`);
            }
        } catch (err) {
            setMessage(`Network error: ${err}`);
        }
    };

    const fetchCapes = async () => {
        try {
            const res = await fetch(`${env}/cosmetics/capes`);
            if (res.ok) {
                const data = await res.json();
                console.log(data.capes);
                setCapes(data.capes);
            } else {
                setMessage(`Error fetching capes: ${res.status}`);
            }
        } catch (err) {
            setMessage(`Network error: ${err}`);
        }
    };

    return (
        <div className="min-h-screen bg-[#282c34] text-white flex flex-col items-center py-10">
            <h1 className="text-3xl font-bold mb-8">PolyPlus Admin</h1>

            <form
                onSubmit={handleUpload}
                className="flex flex-col gap-4 w-full max-w-md bg-gray-800 p-6 rounded-lg shadow-xl"
            >
                <div className="flex flex-col">
                    <label className="mb-1 text-sm text-gray-300">
                        Environment
                    </label>
                    <select
                        value={env}
                        onChange={(e) => setEnv(e.target.value)}
                        className="p-2 rounded bg-gray-700 border border-gray-600 focus:outline-none focus:border-[#61dafb]"
                    >
                        <option value="https://plus-staging.polyfrost.org">
                            Staging
                        </option>
                        <option value="https://plus.polyfrost.org">
                            Production
                        </option>
                    </select>
                </div>

                <div className="flex flex-col">
                    <label className="mb-1 text-sm text-gray-300">
                        Admin Password
                    </label>
                    <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="p-2 rounded bg-gray-700 border border-gray-600 focus:outline-none focus:border-[#61dafb]"
                        placeholder="Enter password"
                    />
                </div>

                <div className="flex flex-col">
                    <label className="mb-1 text-sm text-gray-300">
                        Cape File
                    </label>
                    <input
                        type="file"
                        onChange={(e) => setFile(e.target.files?.[0] || null)}
                        className="p-2 rounded bg-gray-700 border border-gray-600 focus:outline-none focus:border-[#61dafb]"
                    />
                </div>

                <button
                    type="submit"
                    className="mt-4 bg-[#61dafb] text-gray-900 font-bold py-2 rounded hover:bg-[#4fa8c7] transition-colors"
                >
                    Upload Cape
                </button>

                {message && (
                    <div className="mt-4 p-3 bg-gray-700 rounded text-center text-sm break-words">
                        {message}
                    </div>
                )}
            </form>

            <div className="w-full max-w-4xl mt-12 px-4">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-2xl font-bold">Available Capes</h2>
                    <button
                        onClick={fetchCapes}
                        className="bg-[#61dafb] text-gray-900 font-bold py-2 px-4 rounded hover:bg-[#4fa8c7] transition-colors"
                    >
                        Load Capes
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {capes?.map((cape) => (
                        <div
                            key={cape.id}
                            className="bg-gray-800 p-4 rounded-lg shadow-xl flex flex-col"
                        >
                            <div className="flex justify-between items-start mb-2">
                                <span className="text-sm font-mono text-gray-400">
                                    #{cape.id}
                                </span>
                                <span className="text-xs bg-gray-700 px-2 py-1 rounded text-gray-300">
                                    {cape.type}
                                </span>
                            </div>

                            {cape.url ? (
                                <div className="aspect-video bg-gray-900 rounded mb-3 overflow-hidden flex items-center justify-center">
                                    <img
                                        src={cape.url}
                                        alt={`Cape ${cape.id}`}
                                        className="max-w-full max-h-full object-contain cursor-pointer"
                                        title="Click to copy URL"
                                        onClick={() => {
                                            navigator.clipboard.writeText(
                                                cape.url!,
                                            );
                                            alert("Copied URL to clipboard");
                                        }}
                                    />
                                </div>
                            ) : (
                                <div className="aspect-video bg-gray-900 rounded mb-3 flex items-center justify-center text-gray-500 text-sm">
                                    No Preview
                                </div>
                            )}

                            <div className="mt-auto">
                                <div
                                    className="text-xs text-gray-500 font-mono truncate"
                                    title={cape.hash}
                                >
                                    {cape.hash}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
