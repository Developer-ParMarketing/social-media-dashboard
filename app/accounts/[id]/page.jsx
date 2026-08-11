"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import API from "@/services/api";

/* ── helpers ── */
const fmt = (n) => (n ?? 0).toLocaleString("en-IN");
const fmtSec = (s) => (s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`);

const PLATFORM_COLORS = {
    facebook: { bg: "bg-blue-50", text: "text-blue-700", border: "border-blue-200", dot: "bg-blue-500" },
    instagram: { bg: "bg-fuchsia-50", text: "text-fuchsia-700", border: "border-fuchsia-200", dot: "bg-fuchsia-500" },
};

const TYPE_COLORS = {
    reel: { bg: "bg-amber-50", text: "text-amber-700" },
    video: { bg: "bg-orange-50", text: "text-orange-700" },
    post: { bg: "bg-emerald-50", text: "text-emerald-700" },
};

const fmtHMS = (sec) => {
    if (!sec) return "—";
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;

    return `${h}h ${m}m ${s}s`;
};

/* ════════════════════════════════════════════════════
   ANALYTICS CHARTS SECTION
════════════════════════════════════════════════════ */
function AnalyticsCharts({ monthly }) {
    const refEngagement = useRef(null);
    const refReach = useRef(null);
    const refContent = useRef(null);
    const refReels = useRef(null);
    const chartInstances = useRef({});
    const [activeMetric, setActiveMetric] = useState("engagement");

    const chartRefs = {
        engagement: refEngagement,
        reach: refReach,
        content: refContent,
        reels: refReels,
    };

    const months = (monthly || []).map((m) => m.month);

    const datasets = {
        engagement: {
            title: "Engagement Over Time",
            subtitle: "Likes + comments + shares + saves",
            charts: [
                {
                    id: "engagement",
                    label: "Total Engagement",
                    type: "line",
                    datasets: [
                        {
                            label: "Facebook",
                            data: (monthly || []).map((m) => m.facebook?.engagement ?? 0),
                            borderColor: "#3b82f6",
                            backgroundColor: "rgba(59,130,246,0.08)",
                            borderWidth: 2,
                            pointRadius: 4,
                            pointHoverRadius: 6,
                            tension: 0.4,
                            fill: true,
                            borderDash: [],
                            pointStyle: "circle",
                        },
                        {
                            label: "Instagram",
                            data: (monthly || []).map((m) => m.instagram?.engagement ?? 0),
                            borderColor: "#d946ef",
                            backgroundColor: "rgba(217,70,239,0.08)",
                            borderWidth: 2,
                            pointRadius: 4,
                            pointHoverRadius: 6,
                            tension: 0.4,
                            fill: true,
                            borderDash: [6, 3],
                            pointStyle: "rectRot",
                        },
                    ],
                },
            ],
        },
        reach: {
            title: "Reach & Views",
            subtitle: "How many unique accounts saw your content",
            charts: [
                {
                    id: "reach",
                    label: "Reach & Views",
                    type: "line",
                    datasets: [
                        {
                            label: "FB Reach",
                            data: (monthly || []).map((m) => m.facebook?.reach ?? 0),
                            borderColor: "#3b82f6",
                            backgroundColor: "rgba(59,130,246,0.06)",
                            borderWidth: 2,
                            pointRadius: 4,
                            tension: 0.4,
                            fill: false,
                            borderDash: [],
                            pointStyle: "circle",
                        },
                        {
                            label: "IG Reach",
                            data: (monthly || []).map((m) => m.instagram?.reach ?? 0),
                            borderColor: "#d946ef",
                            backgroundColor: "rgba(217,70,239,0.06)",
                            borderWidth: 2,
                            pointRadius: 4,
                            tension: 0.4,
                            fill: false,
                            borderDash: [6, 3],
                            pointStyle: "rectRot",
                        },
                        {
                            label: "IG Views",
                            data: (monthly || []).map((m) => m.instagram?.views ?? 0),
                            borderColor: "#f59e0b",
                            backgroundColor: "rgba(245,158,11,0.06)",
                            borderWidth: 2,
                            pointRadius: 4,
                            tension: 0.4,
                            fill: false,
                            borderDash: [2, 4],
                            pointStyle: "triangle",
                        },
                    ],
                },
            ],
        },
        content: {
            title: "Content Volume",
            subtitle: "Posts and reels published per month",
            charts: [
                {
                    id: "content",
                    label: "Posts & Reels",
                    type: "line",
                    datasets: [
                        {
                            label: "FB Posts",
                            data: (monthly || []).map((m) => m.facebook?.posts ?? 0),
                            backgroundColor: "rgba(59,130,246,0.75)",
                            borderColor: "#3b82f6",
                            borderWidth: 1,
                            borderRadius: 4,
                            pointStyle: "rect",
                        },
                        {
                            label: "IG Posts",
                            data: (monthly || []).map((m) => m.instagram?.posts ?? 0),
                            backgroundColor: "rgba(217,70,239,0.75)",
                            borderColor: "#d946ef",
                            borderWidth: 1,
                            borderRadius: 4,
                            pointStyle: "rect",
                        },
                        {
                            label: "IG Reels",
                            data: (monthly || []).map((m) => m.instagram?.reels ?? 0),
                            backgroundColor: "rgba(245,158,11,0.75)",
                            borderColor: "#f59e0b",
                            borderWidth: 1,
                            borderRadius: 4,
                            pointStyle: "rect",
                        },
                    ],
                },
            ],
        },
        reels: {
            title: "Reels Performance",
            subtitle: "Saves, watch time, and skip behaviour",
            charts: [
                {
                    id: "reels",
                    label: "Saves & Watch Time",
                    type: "line",
                    datasets: [
                        {
                            label: "IG Saves",
                            data: (monthly || []).map((m) => m.instagram?.saves ?? 0),
                            borderColor: "#10b981",
                            backgroundColor: "rgba(16,185,129,0.08)",
                            borderWidth: 2,
                            pointRadius: 4,
                            tension: 0.4,
                            fill: true,
                            borderDash: [],
                            pointStyle: "circle",
                        },
                        {
                            label: "Watch Time (s)",
                            data: (monthly || []).map((m) => m.instagram?.totalWatchTimeSec ?? 0),
                            borderColor: "#f59e0b",
                            backgroundColor: "rgba(245,158,11,0.06)",
                            borderWidth: 2,
                            pointRadius: 4,
                            tension: 0.4,
                            fill: false,
                            borderDash: [6, 3],
                            pointStyle: "triangle",
                            yAxisID: "y1",
                        },
                    ],
                },
            ],
        },
    };

    useEffect(() => {
        const loadCharts = async () => {
            if (typeof window === "undefined") return;

            // Destroy existing instances
            Object.values(chartInstances.current).forEach((c) => c?.destroy());
            chartInstances.current = {};

            if (!window.Chart) {
                await new Promise((resolve, reject) => {
                    const s = document.createElement("script");
                    s.src = "https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js";
                    s.onload = resolve;
                    s.onerror = reject;
                    document.head.appendChild(s);
                });
            }

            const current = datasets[activeMetric];
            current.charts.forEach((chartDef) => {
                const canvas = chartRefs[chartDef.id]?.current;
                if (!canvas) return;

                const isBar = chartDef.type === "bar";
                const hasY1 = chartDef.datasets.some((d) => d.yAxisID === "y1");

                chartInstances.current[chartDef.id] = new window.Chart(canvas, {
                    type: chartDef.type,
                    data: {
                        labels: months,
                        datasets: chartDef.datasets,
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        interaction: { mode: "index", intersect: false },
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                backgroundColor: "#1e1b4b",
                                titleColor: "#e0e7ff",
                                bodyColor: "#c7d2fe",
                                padding: 12,
                                cornerRadius: 8,
                                callbacks: {
                                    label: (ctx) => {
                                        if (ctx.dataset.label.includes("Watch Time")) {
                                            const sec = ctx.raw;
                                            const h = Math.floor(sec / 3600);
                                            const m = Math.floor((sec % 3600) / 60);

                                            return ` Watch Time: ${h}h ${m}m`;
                                        }
                                        return ` ${ctx.dataset.label}: ${Number(ctx.raw).toLocaleString("en-IN")}`;
                                    },
                                },
                            },
                        },
                        scales: {
                            x: {
                                grid: { color: "rgba(0,0,0,0.04)", drawBorder: false },
                                ticks: {
                                    color: "#9ca3af",
                                    font: { size: 11 },
                                    autoSkip: false,
                                    maxRotation: 45,
                                },
                            },
                            y: {
                                position: "left",
                                grid: { color: "rgba(0,0,0,0.04)", drawBorder: false },
                                ticks: {
                                    color: "#9ca3af",
                                    font: { size: 11 },
                                    callback: (v) => {
                                        if (v >= 1000000) return `${(v / 1000000).toFixed(1)}M`;
                                        if (v >= 1000) return `${(v / 1000).toFixed(0)}K`;
                                        return v;
                                    },
                                },
                                beginAtZero: true,
                            },
                            ...(hasY1
                                ? {
                                    y1: {
                                        position: "right",
                                        grid: { drawOnChartArea: false },
                                        ticks: {
                                            color: "#f59e0b",
                                            font: { size: 11 },
                                            callback: (v) => {
                                                const hours = v / 3600;
                                                if (hours >= 100) return `${Math.round(hours)}h`;
                                                return `${hours.toFixed(1)}h`;
                                            },
                                        },
                                        beginAtZero: true,
                                    },
                                }
                                : {}),
                        },
                        ...(isBar ? { barPercentage: 0.6, categoryPercentage: 0.8 } : {}),
                    },
                });
            });
        };

        if (monthly?.length) loadCharts();

        return () => {
            Object.values(chartInstances.current).forEach((c) => c?.destroy());
        };
    }, [activeMetric, monthly]);

    if (!monthly?.length) return null;

    const tabs = [
        { key: "engagement", label: "Engagement", icon: "📈" },
        { key: "reach", label: "Reach & Views", icon: "📡" },
        { key: "content", label: "Content Volume", icon: "📦" },
        { key: "reels", label: "Reels", icon: "🎬" },
    ];

    const current = datasets[activeMetric];
    const allDatasets = current.charts.flatMap((c) => c.datasets);

    return (
        <div>
            <SectionTitle>📊 Analytics Charts</SectionTitle>

            {/* Tab switcher */}
            <div className="flex gap-2 flex-wrap mb-5">
                {tabs.map((tab) => (
                    <button
                        key={tab.key}
                        onClick={() => setActiveMetric(tab.key)}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all ${activeMetric === tab.key
                            ? "bg-indigo-600 text-white shadow"
                            : "bg-white border border-gray-200 text-gray-500 hover:border-indigo-300 hover:text-indigo-600"
                            }`}
                    >
                        <span style={{ fontSize: 14 }}>{tab.icon}</span>
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Chart card */}
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-5">
                {/* Header + legend */}
                <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
                    <div>
                        <p className="font-bold text-gray-800 text-base">{current.title}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{current.subtitle}</p>
                    </div>
                    {/* Custom legend */}
                    <div className="flex flex-wrap gap-4">
                        {allDatasets.map((ds) => (
                            <div key={ds.label} className="flex items-center gap-2 text-xs text-gray-500">
                                {/* Color swatch */}
                                {current.charts[0]?.type === "bar" ? (
                                    <span
                                        className="inline-block w-3 h-3 rounded-sm flex-shrink-0"
                                        style={{ background: ds.backgroundColor }}
                                    />
                                ) : (
                                    <span className="inline-flex items-center gap-0.5 flex-shrink-0">
                                        <span
                                            className="inline-block h-0.5 w-5"
                                            style={{
                                                background: ds.borderColor,
                                                borderTop: `2px ${ds.borderDash?.length ? "dashed" : "solid"} ${ds.borderColor}`,
                                                height: 0,
                                            }}
                                        />
                                        <span
                                            className="inline-block w-2 h-2 rounded-full flex-shrink-0"
                                            style={{ background: ds.borderColor }}
                                        />
                                    </span>
                                )}
                                <span className="font-medium">{ds.label}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Charts */}
                {current.charts.map((chartDef) => (
                    <div key={chartDef.id} style={{ position: "relative", height: 300, width: "100%" }}>
                        <canvas
                            ref={chartRefs[chartDef.id]}
                            id={`chart-${chartDef.id}`}
                            role="img"
                            aria-label={`${chartDef.label} line chart over ${months.length} months`}
                        />
                    </div>
                ))}

                {/* Quick insight strip */}
                <QuickInsights monthly={monthly} metric={activeMetric} />
            </div>
        </div>
    );
}

/* Quick insights beneath each chart */
function QuickInsights({ monthly, metric }) {
    if (!monthly?.length) return null;

    const insights = [];

    if (metric === "engagement") {
        const fbTotal = monthly.reduce((s, m) => s + (m.facebook?.engagement ?? 0), 0);
        const igTotal = monthly.reduce((s, m) => s + (m.instagram?.engagement ?? 0), 0);
        const best = [...monthly].sort(
            (a, b) =>
                (b.facebook?.engagement ?? 0) +
                (b.instagram?.engagement ?? 0) -
                ((a.facebook?.engagement ?? 0) + (a.instagram?.engagement ?? 0))
        )[0];
        insights.push(
            { label: "FB Total Engagement", value: fmt(fbTotal), color: "text-blue-600" },
            { label: "IG Total Engagement", value: fmt(igTotal), color: "text-fuchsia-600" },
            { label: "Best Month", value: best?.month, color: "text-indigo-600" }
        );
    } else if (metric === "reach") {
        const fbReach = monthly.reduce((s, m) => s + (m.facebook?.reach ?? 0), 0);
        const igReach = monthly.reduce((s, m) => s + (m.instagram?.reach ?? 0), 0);
        const igViews = monthly.reduce((s, m) => s + (m.instagram?.views ?? 0), 0);
        insights.push(
            { label: "Total FB Reach", value: fmt(fbReach), color: "text-blue-600" },
            { label: "Total IG Reach", value: fmt(igReach), color: "text-fuchsia-600" },
            { label: "Total IG Views", value: fmt(igViews), color: "text-amber-600" }
        );
    } else if (metric === "content") {
        const fbPosts = monthly.reduce((s, m) => s + (m.facebook?.posts ?? 0), 0);
        const igPosts = monthly.reduce((s, m) => s + (m.instagram?.posts ?? 0), 0);
        const igReels = monthly.reduce((s, m) => s + (m.instagram?.reels ?? 0), 0);
        insights.push(
            { label: "Total FB Posts", value: fbPosts, color: "text-blue-600" },
            { label: "Total IG Posts", value: igPosts, color: "text-fuchsia-600" },
            { label: "Total IG Reels", value: igReels, color: "text-amber-600" }
        );
    } else if (metric === "reels") {
        const totalSaves = monthly.reduce((s, m) => s + (m.instagram?.saves ?? 0), 0);
        const totalWatch = monthly.reduce((s, m) => s + (m.instagram?.totalWatchTimeSec ?? 0), 0);
        const bestSaveMonth = [...monthly].sort((a, b) => (b.instagram?.saves ?? 0) - (a.instagram?.saves ?? 0))[0];
        insights.push(
            { label: "Total IG Saves", value: fmt(totalSaves), color: "text-emerald-600" },
            { label: "Total Watch Time", value: fmtSec(totalWatch), color: "text-amber-600" },
            { label: "Most Saves Month", value: bestSaveMonth?.month, color: "text-indigo-600" }
        );
    }

    return (
        <div className="mt-5 pt-4 border-t border-gray-100 flex flex-wrap gap-6">
            {insights.map((ins) => (
                <div key={ins.label}>
                    <p className="text-[10px] text-gray-400 uppercase tracking-widest">{ins.label}</p>
                    <p className={`text-base font-bold mt-0.5 ${ins.color}`}>{ins.value}</p>
                </div>
            ))}
        </div>
    );
}

/* ════════════════════════════════════════════════════
   MAIN PAGE
════════════════════════════════════════════════════ */
export default function AccountDetails() {
    const router = useRouter();
    const { id } = useParams();
    const searchParams = useSearchParams();
    const pageToken = searchParams.get("token");

    const [loading, setLoading] = useState(true);
    const [dashboard, setDashboard] = useState(null);
    const [allComments, setAllComments] = useState([]);
    const [loadingComments, setLoadingComments] = useState(true);
    const [selectedPost, setSelectedPost] = useState(null);
    const [activeTab, setActiveTab] = useState("all");
    const [syncing, setSyncing] = useState(false);
    const [lastSynced, setLastSynced] = useState(null);
    const [expandedComment, setExpandedComment] = useState(null);

    const [filters, setFilters] = useState({ platform: "all", type: "all", since: "", until: "" });
    const [contentPage, setContentPage] = useState(1);
    const [content, setContent] = useState({ data: [], pagination: { page: 1, totalPages: 1, total: 0 } });
    const [contentLoading, setContentLoading] = useState(true);

    const handleSync = async () => {
        if (!id || !pageToken) return;

        try {
            setSyncing(true);

            // Start background sync (returns 202, ignore response)
            await API.post(`/sync/${id}`, {
                access_token: pageToken,
            });

            // ✅ Poll for real data (don't use 202 response)
            const interval = setInterval(async () => {
                try {
                    const res = await API.get(`/sync/${id}`);

                    // Only set dashboard if it has real page data
                    if (res.data?.page) {
                        setDashboard(res.data);
                        setLastSynced(res.data.syncedAt);
                        clearInterval(interval);
                        setSyncing(false);
                    }
                } catch (err) {
                    console.error(err);
                }
            }, 5000);

        } catch (err) {
            setSyncing(false);
            alert(err.response?.data?.error || err.message);
        }
    };

    useEffect(() => {
        if (!id) return;
        (async () => {
            try {
                setContentLoading(true);
                const params = { page: contentPage, limit: 24, ...filters };
                Object.keys(params).forEach((k) => {
                    if (params[k] === "" || params[k] === "all") delete params[k];
                });
                const res = await API.get(`/sync/${id}/content`, { params });
                setContent(res.data);
            } catch (err) {
                console.error(err);
            } finally {
                setContentLoading(false);
            }
        })();
    }, [id, contentPage, filters]);

    const updateFilter = (patch) => {
        setContentPage(1);
        setFilters((f) => ({ ...f, ...patch }));
    };

    useEffect(() => {
        if (!id || !pageToken) return;
        (async () => {
            try {
                setLoading(true);
                // Try DB first
                const res = await API.get(`/sync/${id}`);

                if (res.data?.page) {
                    setDashboard(res.data);
                    setLastSynced(res.data.syncedAt);
                }
                setLastSynced(res.data.syncedAt);
            } catch (err) {
                // 404 = never synced — trigger first sync automatically
                if (err.response?.status === 404) {
                    await handleSync();
                } else {
                    console.error("Dashboard fetch error:", err);
                }
            } finally {
                setLoading(false);
            }
        })();
    }, [id, pageToken]);

    useEffect(() => {
        if (!dashboard) return;
        const comments = dashboard.comments || [];
        const flat = comments.map((c) => ({
            platform: c.platform,
            postId: c.postId,
            username: c.username,
            text: c.text,
            timestamp: c.timestamp,
        }));
        setAllComments(flat);
        setLoadingComments(false);
    }, [dashboard]);

    // useEffect(() => {
    //     if (!id || !pageToken) return;
    //     (async () => {
    //         try {
    //             setLoading(true);
    //             const res = await API.get(`/facebook/dashboard/${id}`, {
    //                 params: { access_token: pageToken },
    //             });
    //             setDashboard(res.data);
    //         } catch (err) {
    //             console.error("Dashboard fetch error:", err);
    //         } finally {
    //             setLoading(false);
    //         }
    //     })();
    // }, [id, pageToken]);

    // useEffect(() => {
    //     if (!id || !pageToken) return;
    //     (async () => {
    //         try {
    //             setLoadingComments(true);
    //             const res = await API.get(`/facebook/comments/${id}`, {
    //                 params: { access_token: pageToken },
    //             });
    //             const posts = res.data?.data || [];
    //             const flat = [];
    //             posts.forEach((post) => {
    //                 const postId = post.postId || post.mediaId;
    //                 (post.postComments || []).forEach((c) => {
    //                     flat.push({
    //                         platform: post.platform,
    //                         postId,
    //                         message: post.message || post.caption,
    //                         username: c.username || c.from?.name || "Unknown",
    //                         text: c.text || c.message || "",
    //                         timestamp: c.timestamp || c.created_time,
    //                     });
    //                 });
    //             });
    //             setAllComments(flat);
    //         } catch (err) {
    //             console.error("Comments fetch error:", err);
    //         } finally {
    //             setLoadingComments(false);
    //         }
    //     })();
    // }, [id, pageToken]);

    if (loading) return <Loader />;

    if (!dashboard || !dashboard.page) {
        return <Loader />;
    }

    const { page, summary, instagram, facebook, bestOverall, globalBest, bestByCategory, igBest, monthly, data: allContent } = dashboard;
    console.log('summary', summary);

    const igActualCount = instagram?.data?.length || 0;

    const fbPosts = (allContent || []).filter((p) => p.platform === "facebook");
    const igPosts = (allContent || []).filter((p) => p.platform === "instagram");

    const filteredPosts =
        activeTab === "all" ? allContent :
            activeTab === "facebook" ? fbPosts :
                activeTab === "instagram" ? igPosts : allContent;

    const topContent = [
        { label: "🏆 Best overall", post: globalBest || bestOverall },
        { label: "📘 Best FB post", post: bestByCategory?.post },
        { label: "📹 Best FB reel", post: bestByCategory?.reel },
        { label: "📷 Best IG post", post: igBest?.post },
        { label: "🎬 Best IG reel", post: igBest?.reel },
        { label: "⏱ Most watched reel", post: igBest?.mostWatched },
        { label: "🧲 Best retention", post: igBest?.bestRetention },
    ].filter((i) => i.post);

    return (
        <div className="min-h-screen bg-[#f5f5f0] font-['DM_Sans',sans-serif]">
            <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Syne:wght@700;800&display=swap" rel="stylesheet" />

            {/* NAV */}
            {/* NAV — replace existing nav div */}
            <div className="sticky top-0 z-40 bg-white/80 backdrop-blur border-b border-gray-200 px-6 py-3 flex items-center gap-3">
                {/* Back Button */}
                <button
                    onClick={() => router.back()}
                    className="flex items-center justify-center w-10 h-10 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 hover:border-indigo-300 transition-all"
                >
                    ←
                </button>
                <div className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
                <span className="text-sm font-semibold text-gray-600 tracking-wide uppercase">{page.name}</span>

                {lastSynced && (
                    <span className="text-xs text-gray-400 hidden sm:block">
                        Last synced: {new Date(lastSynced).toLocaleString("en-IN")}
                    </span>
                )}

                <button
                    onClick={handleSync}
                    disabled={syncing}
                    className={`ml-auto flex items-center gap-2 px-4 py-1.5 rounded-xl text-sm font-semibold transition-all
            ${syncing
                            ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                            : "bg-indigo-600 text-white hover:bg-indigo-700 shadow-sm hover:shadow-md"
                        }`}
                >
                    <span className={syncing ? "animate-spin" : ""}>🔄</span>
                    {syncing ? "Syncing…" : "Sync Data"}
                </button>

                <span className="text-xs text-gray-400 sm:hidden">Social Dashboard</span>
            </div>

            <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 space-y-10">

                {/* ── HERO BANNER ── */}
                <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-violet-600 to-fuchsia-600 p-8 text-white">
                    <div className="absolute inset-0 opacity-10" style={{ backgroundImage: "radial-gradient(circle at 20% 50%, white 1px, transparent 1px), radial-gradient(circle at 80% 20%, white 1px, transparent 1px)", backgroundSize: "30px 30px" }} />
                    <h1 className="font-['Syne'] text-4xl md:text-5xl font-extrabold mb-6 relative">{page.name}</h1>
                    <div className="flex flex-wrap gap-8 relative">
                        <HeroStat label="FB Followers" value={fmt(page.followers)} icon="👥" />
                        <HeroStat label="FB Content" value={fmt(summary?.facebookContent)} icon="📘" />
                        {instagram?.profile && <>
                            <HeroStat label="IG Followers" value={fmt(instagram.profile.followers_count)} icon="📷" />
                            <HeroStat label="IG Media (Meta reported)" value={fmt(instagram.profile.media_count)} icon="🗂" />
                        </>}
                        <HeroStat label="Total Content" value={fmt(summary?.totalContent)} icon="📦" />
                    </div>
                </div>

                {/* ── SUMMARY CARDS ── */}
                <div>
                    <SectionTitle>📊 Overall Performance</SectionTitle>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                        <StatCard label="Likes" value={fmt(summary?.totalLikes)} color="text-rose-600" />
                        <StatCard label="Comments" value={fmt(summary?.totalComments)} color="text-indigo-600" />
                        <StatCard label="Shares" value={fmt(summary?.totalShares)} color="text-sky-600" />
                        <StatCard label="Saves" value={fmt(summary?.totalSaves)} color="text-emerald-600" />
                        <StatCard label="Total Reach" value={fmt(summary?.totalReach)} color="text-violet-600" />
                        <StatCard label="Total Views" value={fmt(summary?.totalViews)} color="text-orange-600" />
                        <StatCard label="Engagement" value={fmt(summary?.totalEngagement)} color="text-pink-600" />
                        <StatCard label="FB Content" value={fmt(summary?.facebookContent)} color="text-blue-600" />
                        <StatCard label="IG Content" value={fmt(igActualCount)} color="text-fuchsia-600" />
                    </div>
                </div>

                {/* ── MONTHLY TABLE ── */}
                <div>
                    <SectionTitle>📅 Monthly Breakdown</SectionTitle>
                    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
                        <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
                            <table className="w-full text-sm min-w-[900px]">
                                <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 z-10">
                                    <tr>
                                        {["Month", "FB Posts", "FB Likes", "FB Reach", "FB Engagement", "IG Posts", "IG Reels", "IG Likes", "IG Views", "IG Reach", "IG Saves", "IG Watch Time", "Total Engagement"].map((h, i) => (
                                            <th key={h} className={`px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider whitespace-nowrap ${i === 0 ? "text-left" : "text-right"}`}>{h}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {[...(monthly || [])].reverse().map((m, i) => (
                                        <tr key={i} className="hover:bg-gray-50/60 transition-colors">
                                            <td className="px-4 py-3 font-semibold text-gray-800 whitespace-nowrap">{m.month}</td>
                                            <td className="px-4 py-3 text-right text-gray-700">{m.facebook?.posts ?? 0}</td>
                                            <td className="px-4 py-3 text-right text-gray-700">{fmt(m.facebook?.likes)}</td>
                                            <td className="px-4 py-3 text-right text-gray-700">{fmt(m.facebook?.reach)}</td>
                                            <td className="px-4 py-3 text-right font-medium text-blue-600">{fmt(m.facebook?.engagement)}</td>
                                            <td className="px-4 py-3 text-right text-gray-700">{m.instagram?.posts ?? 0}</td>
                                            <td className="px-4 py-3 text-right text-gray-700">{m.instagram?.reels ?? 0}</td>
                                            <td className="px-4 py-3 text-right text-gray-700">{fmt(m.instagram?.likes)}</td>
                                            <td className="px-4 py-3 text-right text-gray-700">{fmt(m.instagram?.views)}</td>
                                            <td className="px-4 py-3 text-right text-gray-700">{fmt(m.instagram?.reach)}</td>
                                            <td className="px-4 py-3 text-right text-gray-700">{fmt(m.instagram?.saves)}</td>
                                            <td className="px-4 py-3 text-right text-gray-700">
                                                {m.instagram?.totalWatchTimeSec > 0
                                                    ? fmtHMS(m.instagram.totalWatchTimeSec)
                                                    : "—"}
                                            </td>
                                            <td className="px-4 py-3 text-right font-bold text-indigo-600">
                                                {fmt((m.facebook?.engagement ?? 0) + (m.instagram?.engagement ?? 0))}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>

                {/* ── IG REELS STATS ── */}
                {summary?.reels?.count > 0 && (
                    <div>
                        <SectionTitle>🎬 Instagram Reels Insights</SectionTitle>
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                            <StatCard label="Total Reels" value={summary.reels.count} color="text-amber-600" />
                            <StatCard label="Avg Watch Time" value={`${summary.reels.avgWatchTimeSec}s`} color="text-indigo-600" />
                            <StatCard label="Total Watch Time" value={`${summary.reels.totalWatchTimeMin}m`} color="text-violet-600" />
                            <StatCard label="Avg Skip Rate" value={summary.reels.avgSkipRatePct} color="text-rose-600" />
                        </div>
                    </div>
                )}

                {/* ── ANALYTICS CHARTS ── */}
                <AnalyticsCharts monthly={monthly} />

                {/* ── TOP PERFORMING ── */}
                {topContent.length > 0 && (
                    <div>
                        <SectionTitle>🏆 Top Performing Content</SectionTitle>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                            {topContent.map((item, i) => (
                                <PostCard key={i} post={item.post} label={item.label} onClick={setSelectedPost} />
                            ))}
                        </div>
                    </div>
                )}

                {/* ── ALL CONTENT with filters + pagination ── */}
                <div>
                    <SectionTitle>📁 All Content ({fmt(content.pagination.total)})</SectionTitle>

                    <div className="flex flex-wrap items-center gap-3 mb-4 bg-white border border-gray-200 rounded-xl p-3">
                        <div className="flex gap-1">
                            {["all", "facebook", "instagram"].map((p) => (
                                <button
                                    key={p}
                                    onClick={() => updateFilter({ platform: p })}
                                    className={`px-3 py-1.5 rounded-lg text-sm font-medium ${filters.platform === p ? "bg-indigo-600 text-white" : "text-gray-500 hover:bg-gray-100"}`}
                                >
                                    {p === "all" ? "All" : p === "facebook" ? "FB" : "IG"}
                                </button>
                            ))}
                        </div>
                        <select
                            value={filters.type}
                            onChange={(e) => updateFilter({ type: e.target.value })}
                            className="text-sm border border-gray-200 rounded-lg px-2 py-1.5"
                        >
                            <option value="all">All types</option>
                            <option value="post">Posts</option>
                            <option value="reel">Reels</option>
                            <option value="video">Videos</option>
                        </select>
                        <input type="date" value={filters.since} onChange={(e) => updateFilter({ since: e.target.value })} className="text-sm border border-gray-200 rounded-lg px-2 py-1.5" />
                        <span className="text-gray-400 text-sm">to</span>
                        <input type="date" value={filters.until} onChange={(e) => updateFilter({ until: e.target.value })} className="text-sm border border-gray-200 rounded-lg px-2 py-1.5" />
                        {(filters.platform !== "all" || filters.type !== "all" || filters.since || filters.until) && (
                            <button onClick={() => updateFilter({ platform: "all", type: "all", since: "", until: "" })} className="text-xs text-gray-400 underline">
                                Clear filters
                            </button>
                        )}
                    </div>

                    {contentLoading ? (
                        <div className="bg-white rounded-xl p-8 text-center text-gray-400 text-sm border border-gray-100">
                            Loading content…
                        </div>
                    ) : (
                        <>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                                {content.data.map((post, i) => (
                                    <PostCard key={`${post.platform}-${post.id}-${i}`} post={post} onClick={setSelectedPost} />
                                ))}
                            </div>

                            <div className="flex items-center justify-center gap-3 mt-6">
                                <button
                                    disabled={contentPage <= 1}
                                    onClick={() => setContentPage((p) => p - 1)}
                                    className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium disabled:opacity-40"
                                >
                                    ← Prev
                                </button>
                                <span className="text-sm text-gray-500">
                                    Page {content.pagination.page} of {content.pagination.totalPages} ({content.pagination.total} items)
                                </span>
                                <button
                                    disabled={contentPage >= content.pagination.totalPages}
                                    onClick={() => setContentPage((p) => p + 1)}
                                    className="px-4 py-2 rounded-lg border border-gray-200 text-sm font-medium disabled:opacity-40"
                                >
                                    Next →
                                </button>
                            </div>
                        </>
                    )}
                </div>



                {/* ── COMMENTS TABLE ── */}
                {/* ── COMMENTS SECTION ── */}
                <div>
                    <div className="mb-4">
                        <h3 className="text-lg font-bold text-gray-800">💬 Comments ({allComments?.length || 0})</h3>
                    </div>

                    {loadingComments ? (
                        <div className="bg-white rounded-xl p-8 text-center text-gray-400 text-sm border border-gray-100">
                            Loading comments…
                        </div>
                    ) : !allComments || allComments.length === 0 ? (
                        <div className="bg-white rounded-xl p-8 text-center text-gray-400 text-sm border border-gray-100">
                            No comments found
                        </div>
                    ) : (
                        <div className="space-y-3 max-h-[600px] overflow-y-auto">
                            {allComments.map((c, i) => {
                                const platformColors = {
                                    facebook: "bg-blue-50 border-blue-200 text-blue-900",
                                    instagram: "bg-pink-50 border-pink-200 text-pink-900"
                                };

                                const colors = platformColors[c.platform] || platformColors.facebook;

                                return (
                                    <button
                                        key={i}
                                        onClick={() => setExpandedComment(i)}
                                        className={`w-full text-left rounded-lg border p-4 hover:shadow-md transition-all ${colors}`}
                                    >
                                        <div className="flex items-start justify-between gap-3 mb-2">
                                            <div className="flex flex-col gap-1 flex-1">
                                                <span className="text-sm font-bold">
                                                    {c.username || "Anonymous"}
                                                </span>
                                                <span className="text-xs opacity-70">
                                                    {c.timestamp ? new Date(c.timestamp).toLocaleDateString("en-IN") : "No date"}
                                                </span>
                                            </div>
                                            <span className="text-xs font-mono opacity-60 px-2 py-1 bg-black/5 rounded">
                                                {c.platform}
                                            </span>
                                        </div>
                                        <p className="text-sm line-clamp-2 opacity-90">
                                            {c.text || "No text"}
                                        </p>
                                        {c.text && c.text.length > 80 && (
                                            <p className="text-xs opacity-60 mt-2">Read more →</p>
                                        )}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* ── COMMENT MODAL ── */}
                {expandedComment !== null && allComments && allComments[expandedComment] && (
                    <CommentDetailModal
                        comment={allComments[expandedComment]}
                        onClose={() => setExpandedComment(null)}
                    />
                )}
            </div>

            {selectedPost && <PostModal post={selectedPost} onClose={() => setSelectedPost(null)} />}
        </div>
    );
}

/* ════════════════════════════════════════════════════
   POST CARD
════════════════════════════════════════════════════ */
function PostCard({ post, label, onClick }) {
    if (!post) return null;
    const isVideo = ["reel", "video"].includes(post.type);
    const pc = PLATFORM_COLORS[post.platform] || PLATFORM_COLORS.facebook;
    const tc = TYPE_COLORS[post.type] || TYPE_COLORS.post;

    const mediaUrl = post.image || post.media_url ||
        (post.platform === "facebook" && isVideo ? `https://graph.facebook.com/${post.id}/picture?type=large` : null);

    const date = post.created_time
        ? new Date(post.created_time).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })
        : "";

    return (
        <div
            onClick={() => onClick(post)}
            className="group bg-white rounded-2xl border border-gray-100 hover:border-indigo-200 hover:shadow-lg transition-all duration-200 cursor-pointer overflow-hidden flex flex-col"
        >
            {/* Media */}
            <div className="relative aspect-[4/3] bg-gray-900 overflow-hidden flex-shrink-0">
                {mediaUrl ? (
                    <img
                        src={mediaUrl} alt=""
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        onError={(e) => (e.target.style.display = "none")}
                    />
                ) : (
                    <div className="flex h-full items-center justify-center text-gray-600 text-xs">No media</div>
                )}
                {isVideo && (
                    <div className="absolute inset-0 bg-black/30 flex items-center justify-center">
                        <div className="w-10 h-10 bg-white/90 rounded-full flex items-center justify-center shadow-md">
                            <span className="text-red-500 text-lg ml-0.5">▶</span>
                        </div>
                    </div>
                )}
                {post.score > 0 && (
                    <div className="absolute top-2 right-2 bg-black/70 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                        ⭐ {fmt(post.score)}
                    </div>
                )}
            </div>

            {/* Body */}
            <div className="p-4 flex flex-col flex-1 gap-2">
                {label && <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{label}</p>}
                <div className="flex gap-1.5 flex-wrap">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${pc.bg} ${pc.text}`}>{post.platform}</span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${tc.bg} ${tc.text}`}>{post.type}</span>
                </div>
                <p className="text-xs text-gray-500 line-clamp-2 flex-1 leading-relaxed">
                    {post.message || "No caption"}
                </p>
                <div className="grid grid-cols-4 gap-1 text-center">
                    <MiniStat icon="👍" value={fmt(post.likes)} label="Likes" />
                    <MiniStat icon="💬" value={fmt(post.postComments)} label="Comments" />
                    <MiniStat icon="🔁" value={fmt(post.shares)} label="Shares" />
                    <MiniStat icon="🔖" value={fmt(post.saves)} label="Saves" />
                </div>
                {(post.views > 0 || post.reach > 0) && (
                    <div className="grid grid-cols-2 gap-1 text-center">
                        {post.views > 0 && <MiniStat icon="👁" value={fmt(post.views)} label="Views" />}
                        {post.reach > 0 && <MiniStat icon="📡" value={fmt(post.reach)} label="Reach" />}
                    </div>
                )}
                {post.type === "reel" && (
                    <div className="grid grid-cols-3 gap-1 text-center bg-amber-50 rounded-xl p-2">
                        {post.avgWatchTimeSec != null && <MiniStat icon="⏱" value={`${post.avgWatchTimeSec}s`} label="Avg Watch" amber />}
                        {post.skipRatePct && <MiniStat icon="⏩" value={post.skipRatePct} label="Skip Rate" amber />}
                        {post.completionRate != null && <MiniStat icon="✅" value={`${post.completionRate}%`} label="Completion" amber />}
                    </div>
                )}
                <div className="text-[10px] text-gray-400 pt-1 border-t border-gray-100">{date}</div>
            </div>
        </div>
    );
}

/* ════════════════════════════════════════════════════
   POST MODAL
════════════════════════════════════════════════════ */
function PostModal({ post, onClose }) {
    const isVideo = ["reel", "video"].includes(post.type);
    const pc = PLATFORM_COLORS[post.platform] || PLATFORM_COLORS.facebook;
    const tc = TYPE_COLORS[post.type] || TYPE_COLORS.post;

    useEffect(() => {
        const h = (e) => { if (e.key === "Escape") onClose(); };
        document.addEventListener("keydown", h);
        return () => document.removeEventListener("keydown", h);
    }, [onClose]);

    const engagementStats = [
        { label: "Likes", value: fmt(post.likes), icon: "👍" },
        { label: "Comments", value: fmt(post.postComments), icon: "💬" },
        { label: "Shares", value: fmt(post.shares), icon: "🔁" },
        { label: "Saves", value: fmt(post.saves), icon: "🔖" },
        ...(post.views > 0 ? [{ label: "Views", value: fmt(post.views), icon: "👁" }] : []),
        ...(post.reach > 0 ? [{ label: "Reach", value: fmt(post.reach), icon: "📡" }] : []),
        ...(post.engagement > 0 ? [{ label: "Engagement", value: fmt(post.engagement), icon: "📈" }] : []),
        ...(post.score > 0 ? [{ label: "Score", value: fmt(post.score), icon: "⭐" }] : []),
    ];

    const reelStats = post.type === "reel" ? [
        ...(post.avgWatchTimeSec != null ? [{ label: "Avg Watch Time", value: `${post.avgWatchTimeSec}s`, icon: "⏱" }] : []),
        ...(post.totalWatchTimeSec > 0 ? [{ label: "Total Watch Time", value: fmtSec(post.totalWatchTimeSec), icon: "📺" }] : []),
        ...(post.skipRatePct ? [{ label: "Skip Rate", value: post.skipRatePct, icon: "⏩" }] : []),
        ...(post.completionRate != null ? [{ label: "Completion Rate", value: `${post.completionRate}%`, icon: "✅" }] : []),
        ...(post.approxDurationSec > 0 ? [{ label: "Est. Duration", value: `${post.approxDurationSec}s`, icon: "🎞" }] : []),
        ...(post.crosspostedViews > 0 ? [{ label: "Crossposted Views", value: fmt(post.crosspostedViews), icon: "🔗" }] : []),
        ...(post.facebookViews > 0 ? [{ label: "Facebook Views", value: fmt(post.facebookViews), icon: "📘" }] : []),
    ] : [];

    const igPostStats = (post.platform === "instagram" && post.type === "post") ? [
        ...(post.follows > 0 ? [{ label: "New Follows", value: fmt(post.follows), icon: "➕" }] : []),
        ...(post.profileVisits > 0 ? [{ label: "Profile Visits", value: fmt(post.profileVisits), icon: "🏠" }] : []),
    ] : [];

    return (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
            <div
                className="bg-white rounded-3xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col shadow-2xl"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="relative bg-gray-900 flex-shrink-0 flex items-center justify-center" style={{ maxHeight: "50vh" }}>
                    {isVideo ? (
                        <video src={post.image} controls autoPlay className="w-full max-h-[50vh] object-contain" />
                    ) : (post.image || post.media_url) ? (
                        <img src={post.image || post.media_url} alt="" className="w-full max-h-[50vh] object-contain" />
                    ) : (
                        <div className="py-16 text-gray-500 text-sm">No media available</div>
                    )}
                    <button onClick={onClose} className="absolute top-3 right-3 bg-white/90 hover:bg-white text-gray-700 text-xs font-semibold px-3 py-1.5 rounded-xl shadow transition">
                        ✕ Close
                    </button>
                </div>
                <div className="p-6 overflow-y-auto flex-1 space-y-5">
                    <div className="flex gap-2 flex-wrap items-center">
                        <span className={`text-xs font-bold px-3 py-1 rounded-full ${pc.bg} ${pc.text}`}>{post.platform}</span>
                        <span className={`text-xs font-bold px-3 py-1 rounded-full capitalize ${tc.bg} ${tc.text}`}>{post.type}</span>
                        {post.score > 0 && <span className="text-xs font-bold px-3 py-1 rounded-full bg-yellow-50 text-yellow-700">⭐ Score: {fmt(post.score)}</span>}
                    </div>
                    {post.message && <p className="text-gray-700 text-sm leading-relaxed">{post.message}</p>}
                    <div>
                        <p className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3">Engagement</p>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            {engagementStats.map((s) => (
                                <div key={s.label} className="bg-gray-50 rounded-xl p-3 text-center">
                                    <p className="text-lg mb-0.5">{s.icon}</p>
                                    <p className="text-lg font-bold text-gray-800">{s.value}</p>
                                    <p className="text-[10px] text-gray-400 uppercase tracking-wide">{s.label}</p>
                                </div>
                            ))}
                        </div>
                    </div>
                    {reelStats.length > 0 && (
                        <div>
                            <p className="text-xs font-bold text-amber-600 uppercase tracking-widest mb-3">Reel Performance</p>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                {reelStats.map((s) => (
                                    <div key={s.label} className="bg-amber-50 rounded-xl p-3 text-center border border-amber-100">
                                        <p className="text-lg mb-0.5">{s.icon}</p>
                                        <p className="text-lg font-bold text-amber-800">{s.value}</p>
                                        <p className="text-[10px] text-amber-600 uppercase tracking-wide">{s.label}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    {igPostStats.length > 0 && (
                        <div>
                            <p className="text-xs font-bold text-fuchsia-600 uppercase tracking-widest mb-3">Profile Actions</p>
                            <div className="grid grid-cols-2 gap-3">
                                {igPostStats.map((s) => (
                                    <div key={s.label} className="bg-fuchsia-50 rounded-xl p-3 text-center border border-fuchsia-100">
                                        <p className="text-lg mb-0.5">{s.icon}</p>
                                        <p className="text-lg font-bold text-fuchsia-800">{s.value}</p>
                                        <p className="text-[10px] text-fuchsia-600 uppercase tracking-wide">{s.label}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    {post.created_time && (
                        <p className="text-xs text-gray-400 text-right">
                            Posted: {new Date(post.created_time).toLocaleString("en-IN")}
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
    const Empty = () => (
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
            <p className="text-gray-400">No data available</p>
        </div>
    );
}

/* ════════════════════════════════════════════════════
   ATOMS
════════════════════════════════════════════════════ */
const HeroStat = ({ label, value, icon }) => (
    <div className="text-center">
        <p className="text-white/60 text-xs uppercase tracking-widest mb-1">{icon} {label}</p>
        <p className="text-3xl font-bold font-['Syne']">{value}</p>
    </div>
);

const SectionTitle = ({ children, className = "" }) => (
    <h2 className={`text-lg font-bold text-gray-800 mb-4 ${className}`}>{children}</h2>
);

const StatCard = ({ label, value, color = "text-gray-800" }) => (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 text-center hover:shadow-md transition-shadow">
        <p className={`text-2xl font-bold ${color}`}>{value}</p>
        <p className="text-[10px] text-gray-400 uppercase tracking-wider mt-1">{label}</p>
    </div>
);

const MiniStat = ({ icon, value, label, amber }) => (
    <div className="text-center">
        <p className="text-[10px] text-gray-400">{icon}</p>
        <p className={`text-[11px] font-bold ${amber ? "text-amber-700" : "text-gray-700"}`}>{value ?? "—"}</p>
        <p className="text-[9px] text-gray-400">{label}</p>
    </div>
);

const Loader = () => (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center space-y-4">
            <div className="w-12 h-12 rounded-full border-4 border-indigo-200 border-t-indigo-600 animate-spin mx-auto" />
            <p className="text-gray-400 text-sm">Loading dashboard…</p>
        </div>
    </div>
);

const Empty = () => (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <p className="text-gray-400">No data available</p>
    </div>
);

/* ════════════════════════════════════════════════════
   COMMENT DETAIL MODAL
════════════════════════════════════════════════════ */
function CommentDetailModal({ comment, onClose }) {
    const handleCopy = () => {
        navigator.clipboard.writeText(comment.text || "");
        alert("Comment copied!");
    };

    return (
        <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
            onClick={onClose}
        >
            <div
                className="bg-white rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden flex flex-col shadow-xl"
                onClick={(e) => e.stopPropagation()}
            >
                {/* Header */}
                <div className={`px-6 py-4 border-b border-gray-200 ${comment.platform === "facebook"
                    ? "bg-blue-50"
                    : "bg-pink-50"
                    }`}>
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="font-bold text-gray-900">
                                {comment.username || "Anonymous"}
                            </p>
                            <p className="text-xs text-gray-500 mt-1">
                                {comment.timestamp
                                    ? new Date(comment.timestamp).toLocaleString("en-IN", {
                                        day: "2-digit",
                                        month: "short",
                                        year: "numeric",
                                        hour: "2-digit",
                                        minute: "2-digit"
                                    })
                                    : "No date"
                                }
                            </p>
                        </div>
                        <span className={`px-3 py-1 rounded-full text-xs font-bold ${comment.platform === "facebook"
                            ? "bg-blue-100 text-blue-700"
                            : "bg-pink-100 text-pink-700"
                            }`}>
                            {comment.platform}
                        </span>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto flex-1">
                    {/* Post ID */}
                    <div className="mb-4 pb-4 border-b border-gray-100">
                        <p className="text-xs font-semibold text-gray-500 uppercase mb-1">Post ID</p>
                        <p className="text-sm font-mono text-gray-600">{comment.postId || "N/A"}</p>
                    </div>

                    {/* Full comment */}
                    <div>
                        <p className="text-xs font-semibold text-gray-500 uppercase mb-3">Comment</p>
                        <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
                            <p className="text-sm leading-relaxed text-gray-800 whitespace-pre-wrap break-words">
                                {comment.text || "No text"}
                            </p>
                        </div>
                    </div>

                    {/* Stats */}
                    <div className="mt-4 pt-4 border-t border-gray-100">
                        <p className="text-xs text-gray-500">
                            {comment.text?.length || 0} characters • {comment.text?.split(" ").filter(w => w).length || 0} words
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <div className="bg-gray-50 border-t border-gray-200 px-6 py-3 flex gap-2">
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 text-sm transition-colors"
                    >
                        Close
                    </button>
                    <button
                        onClick={handleCopy}
                        className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg font-semibold hover:bg-gray-100 text-sm transition-colors"
                    >
                        📋 Copy
                    </button>
                </div>
            </div>
        </div>
    );
}
