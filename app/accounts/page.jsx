"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import API from "@/services/api";

export default function AccountsPage() {
    const [accounts, setAccounts] = useState([]);
    const [loading, setLoading] = useState(true);
    const router = useRouter();

    useEffect(() => {
        (async () => {
            try {
                const res = await API.get("/facebook/accounts");
                setAccounts(res.data);
            } catch (err) {
                console.error("Error fetching accounts:", err);
            } finally {
                setLoading(false);
            }
        })();
    }, []);

    const taskIcons = {
        ANALYZE: "📊",
        MANAGE: "⚙️",
        MANAGE_POSTING: "📝",
        MANAGE_PAGES: "📄",
        MANAGE_LEADS: "👥",
        READ_INSIGHTS: "📈",
        MANAGE_MESSAGING: "💬",
    };

    const taskColors = {
        ANALYZE: "bg-blue-100 text-blue-700",
        MANAGE: "bg-purple-100 text-purple-700",
        MANAGE_POSTING: "bg-green-100 text-green-700",
        MANAGE_PAGES: "bg-indigo-100 text-indigo-700",
        MANAGE_LEADS: "bg-pink-100 text-pink-700",
        READ_INSIGHTS: "bg-amber-100 text-amber-700",
        MANAGE_MESSAGING: "bg-cyan-100 text-cyan-700",
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
                <div className="text-center space-y-4">
                    <div className="w-12 h-12 rounded-full border-4 border-indigo-200 border-t-indigo-600 animate-spin mx-auto" />
                    <p className="text-gray-500 font-medium">Loading accounts…</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
            {/* Header */}
            <div className="sticky top-0 z-40 bg-white/80 backdrop-blur border-b border-gray-200 px-6 py-4">
                <div className="max-w-7xl mx-auto">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-3xl font-bold text-gray-900">
                                📘 Meta Accounts
                            </h1>
                            <p className="text-sm text-gray-500 mt-1">
                                {accounts.length} account{accounts.length !== 1 ? "s" : ""} connected
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="max-w-7xl mx-auto px-6 py-10">
                {accounts.length === 0 ? (
                    <div className="text-center py-20">
                        <p className="text-gray-500 text-lg">No accounts found</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {accounts.map((acc) => (
                            <div
                                key={acc.id}
                                onClick={() =>
                                    router.push(`/accounts/${acc.id}?token=${acc.access_token}`)
                                }
                                className="group bg-white rounded-2xl border border-gray-100 shadow-sm hover:shadow-xl hover:border-indigo-200 transition-all duration-300 cursor-pointer overflow-hidden"
                            >
                                {/* Header with gradient */}
                                <div className="h-24 bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 relative overflow-hidden">
                                    <div className="absolute inset-0 opacity-20">
                                        <div className="absolute top-2 right-2 text-4xl">📱</div>
                                    </div>
                                </div>

                                {/* Content */}
                                <div className="p-6 relative -mt-8">
                                    {/* Avatar placeholder */}
                                    <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-indigo-400 to-purple-500 flex items-center justify-center text-2xl font-bold text-white mb-4 shadow-md border-4 border-white">
                                        {acc.name.charAt(0).toUpperCase()}
                                    </div>

                                    {/* Name */}
                                    <h2 className="text-xl font-bold text-gray-900 mb-1 group-hover:text-indigo-600 transition-colors">
                                        {acc.name}
                                    </h2>

                                    {/* Category */}
                                    <div className="flex items-center gap-2 mb-4">
                                        <span className="text-xs font-semibold px-3 py-1 rounded-full bg-gray-100 text-gray-700">
                                            {acc.category || "Business"}
                                        </span>
                                    </div>

                                    {/* Page ID */}
                                    <div className="mb-4 pb-4 border-b border-gray-100">
                                        <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-1">
                                            Page ID
                                        </p>
                                        <p className="text-sm font-mono text-gray-700">
                                            {acc.id}
                                        </p>
                                    </div>

                                    {/* Tasks */}
                                    <div className="mb-4">
                                        <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-3">
                                            Permissions
                                        </p>
                                        <div className="flex flex-wrap gap-2">
                                            {acc.tasks && acc.tasks.length > 0 ? (
                                                acc.tasks.map((task, i) => (
                                                    <span
                                                        key={i}
                                                        className={`text-xs font-semibold px-3 py-1.5 rounded-lg flex items-center gap-1 ${taskColors[task] || "bg-gray-100 text-gray-700"
                                                            }`}
                                                    >
                                                        <span>{taskIcons[task] || "✓"}</span>
                                                        <span>
                                                            {task.replace(/_/g, " ")}
                                                        </span>
                                                    </span>
                                                ))
                                            ) : (
                                                <span className="text-xs text-gray-400">
                                                    No permissions
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* CTA Button */}
                                    <button
                                        className="w-full mt-4 px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition-colors flex items-center justify-center gap-2 group/btn"
                                    >
                                        <span>View Dashboard</span>
                                        <span className="group-hover/btn:translate-x-1 transition-transform">
                                            →
                                        </span>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}