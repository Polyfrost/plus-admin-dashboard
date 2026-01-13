import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

export const Route = createFileRoute("/")({
    component: Dashboard,
});

function Dashboard() {
    const [password, setPassword] = useState("");
    const [env, setEnv] = useState("https://plus-staging.polyfrost.org");
    const [file, setFile] = useState<File | null>(null);
    const [message, setMessage] = useState("");

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
        </div>
    );
}
