"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import API from "@/services/api";
import CommentThreadCard from "@/components/CommentThreadCard";
import {
    CATEGORY_LABELS,
    SENTIMENT_STYLES,
    PRIORITY_STYLES,
    STATUS_STYLES,
    getCommentHighlightClass,
    isFlaggedComment,
    getFlaggedLabel,
    getFlaggedBadgeStyle,
    getMatchedCategories,
    getCategoryMatchLabels,
    pageReplyNeedsReview,
    isLeadInquiry,
} from "@/lib/commentModeration";

const PRIORITY_STYLES_LOCAL = PRIORITY_STYLES;

export default function CommentInboxPage() {
    const router = useRouter();
    const { id: pageId } = useParams();

    const [stats, setStats] = useState(null);
    const [repliesSyncedAt, setRepliesSyncedAt] = useState(null);
    const [comments, setComments] = useState([]);
    const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState(null);
    const [analyzing, setAnalyzing] = useState(false);
    const [brandNames, setBrandNames] = useState([]);

    const [filters, setFilters] = useState({
        status: "all",
        sentiment: "all",
        category: "all",
        priority: "all",
        platform: "all",
        bucket: "all",
        needsReview: "false",
        sort: "confidence",
    });

    const fetchData = useCallback(async () => {
        if (!pageId) return;
        setLoading(true);
        try {
            const params = { page: pagination.page, limit: 25, ...filters };
            Object.keys(params).forEach((k) => {
                if (params[k] === "all" || params[k] === "false") delete params[k];
            });
            if (filters.bucket === "desk") {
                params.excludeLeads = "true";
            }

            const [statsRes, inboxRes] = await Promise.all([
                API.get(`/comments/${pageId}/stats`),
                API.get(`/comments/${pageId}/inbox`, { params }),
            ]);
            setStats(statsRes.data.stats);
            setRepliesSyncedAt(statsRes.data.stats?.repliesSyncedAt || null);
            setComments(inboxRes.data.data);
            setPagination(inboxRes.data.pagination);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [pageId, filters, pagination.page]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    useEffect(() => {
        const handleSyncComplete = (event) => {
            try {
                const payload = typeof event.data === "string"
                    ? JSON.parse(event.data)
                    : event.data;
                if (payload?.pageId === pageId) fetchData();
            } catch {
                /* Ignore unrelated browser events. */
            }
        };

        const channel = typeof window !== "undefined" && "BroadcastChannel" in window
            ? new BroadcastChannel("social-dashboard-sync")
            : null;
        if (channel) channel.addEventListener("message", handleSyncComplete);

        const handleStorage = (event) => {
            if (event.key === "reply-desk-sync-complete" && event.newValue) {
                handleSyncComplete({ data: event.newValue });
            }
        };
        window.addEventListener("storage", handleStorage);

        return () => {
            channel?.removeEventListener("message", handleSyncComplete);
            channel?.close();
            window.removeEventListener("storage", handleStorage);
        };
    }, [fetchData, pageId]);

    useEffect(() => {
        if (!pageId) return;
        (async () => {
            try {
                const res = await API.get(`/comments/playbook/${pageId}`);
                const { pageName, playbook } = res.data?.data || {};
                setBrandNames([pageName, playbook?.brandDisplayName].filter(Boolean));
            } catch {
                /* optional */
            }
        })();
    }, [pageId]);

    const openComment = (c) => {
        setSelected(c);
    };

    const refreshInbox = useCallback(() => {
        fetchData();
        setTimeout(() => fetchData(), 2500);
    }, [fetchData]);

    const handleReanalyze = async () => {
        if (!pageId) return;
        setAnalyzing(true);
        try {
            await API.post(`/comments/${pageId}/analyze`);
            fetchData();
        } catch (err) {
            alert(err.response?.data?.error || err.message);
        } finally {
            setAnalyzing(false);
        }
    };

    const updateFilter = (key, value) => {
        setPagination((p) => ({ ...p, page: 1 }));
        setFilters((f) => ({ ...f, [key]: value }));
    };

    return (
        <div className="min-h-screen bg-[#f5f5f0] font-['DM_Sans',sans-serif]">
            <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Syne:wght@700;800&display=swap" rel="stylesheet" />

            <div className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-gray-200 px-6 py-3 flex items-center gap-3 flex-wrap">
                <button onClick={() => router.back()} className="w-10 h-10 rounded-xl border border-gray-200 bg-white hover:bg-gray-50">←</button>
                <div>
                    <h1 className="font-['Syne'] text-lg font-bold text-gray-900">Reply Desk</h1>
                    <p className="text-xs text-gray-500">
                        Suggestions refresh automatically after sync, guidebook edits, or approve/reject
                    </p>
                    {repliesSyncedAt ? (
                        <p className="text-[11px] text-violet-700 mt-0.5">
                            Replies last synced: {new Date(repliesSyncedAt).toLocaleString("en-IN", {
                                day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
                            })}
                        </p>
                    ) : (
                        <p className="text-[11px] text-gray-400 mt-0.5">Replies not synced yet</p>
                    )}
                </div>
                <div className="ml-auto flex gap-2 flex-wrap">
                    <Link href={`/accounts/${pageId}`} className="px-3 py-1.5 rounded-xl border border-gray-200 text-sm font-medium hover:bg-gray-50">
                        ← Dashboard
                    </Link>
                    <Link href={`/accounts/${pageId}/comments/report`} className="px-3 py-1.5 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-700 text-sm font-medium hover:bg-emerald-100">
                        📊 Report
                    </Link>
                    <Link href={`/guidebook?pageId=${pageId}`} className="px-3 py-1.5 rounded-xl border border-violet-200 bg-violet-50 text-violet-700 text-sm font-medium hover:bg-violet-100">
                        📖 Guidebook
                    </Link>
                    <button
                        onClick={handleReanalyze}
                        disabled={analyzing}
                        className="px-3 py-1.5 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 disabled:opacity-50"
                    >
                        {analyzing ? "Refreshing…" : "↻ Refresh now"}
                    </button>
                </div>
            </div>

            <div className="max-w-7xl mx-auto px-4 md:px-8 py-6 space-y-6">
                {/* Stats */}
                {stats && (
                    <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
                        <StatCard label="Total" value={stats.total} color="text-gray-800" />
                        <StatCard label="Needs Review" value={stats.needsReview} color="text-red-600" highlight />
                        <StatCard label="Negative" value={stats.bySentiment?.negative || 0} color="text-red-500" highlight="red" />
                        <StatCard label="Spam" value={stats.bySentiment?.spam || 0} color="text-orange-600" highlight="orange" />
                        <StatCard label="Abuse" value={stats.bySentiment?.abuse || 0} color="text-purple-700" highlight="purple" />
                        <StatCard label="Suggested" value={stats.byStatus?.suggested || 0} color="text-blue-600" />
                        <StatCard label="Replied" value={stats.byStatus?.replied || 0} color="text-emerald-600" />
                        <StatCard label="Leads" value={stats.leads || 0} color="text-sky-600" />
                        <StatCard label="Critical" value={stats.byPriority?.critical || 0} color="text-red-700" />
                    </div>
                )}

                {/* Filters */}
                <div className="bg-white rounded-2xl border border-gray-200 p-4 flex flex-wrap gap-3">
                    <FilterSelect label="Status" value={filters.status} onChange={(v) => updateFilter("status", v)}
                        options={[["all", "All"], ["suggested", "Suggested"], ["unreviewed", "Unreviewed"], ["approved", "Approved"], ["rejected", "Rejected"], ["replied", "Replied"], ["ignored", "Ignored"]]} />
                    <FilterSelect label="Sentiment" value={filters.sentiment} onChange={(v) => updateFilter("sentiment", v)}
                        options={[["all", "All"], ["negative", "Negative"], ["positive", "Positive"], ["neutral", "Neutral"], ["spam", "Spam"], ["abuse", "Abuse"]]} />
                    <FilterSelect label="Category" value={filters.category} onChange={(v) => updateFilter("category", v)}
                        options={[["all", "All"], ...Object.entries(CATEGORY_LABELS)]} />
                    <FilterSelect label="Priority" value={filters.priority} onChange={(v) => updateFilter("priority", v)}
                        options={[["all", "All"], ["critical", "Critical"], ["high", "High"], ["normal", "Normal"]]} />
                    <FilterSelect label="Bucket" value={filters.bucket} onChange={(v) => updateFilter("bucket", v)}
                        options={[["all", "All"], ["desk", "Reply Desk (no leads)"], ["lead", "Leads only"]]} />
                    <FilterSelect label="Platform" value={filters.platform} onChange={(v) => updateFilter("platform", v)}
                        options={[["all", "All"], ["facebook", "Facebook"], ["instagram", "Instagram"]]} />
                    <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer ml-auto">
                        <input
                            type="checkbox"
                            checked={filters.needsReview === "true"}
                            onChange={(e) => updateFilter("needsReview", e.target.checked ? "true" : "false")}
                            className="rounded"
                        />
                        Needs review only
                    </label>
                </div>

                <HighlightLegend />

                {/* Table */}
                <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                    {loading ? (
                        <p className="p-8 text-center text-gray-400">Loading inbox…</p>
                    ) : comments.length === 0 ? (
                        <div className="p-12 text-center">
                            <p className="text-gray-400 mb-2">No comments match these filters</p>
                            <p className="text-sm text-gray-400">Sync on the account page — analysis runs automatically</p>
                        </div>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                                <thead className="bg-gray-50 text-gray-500 text-xs uppercase">
                                    <tr>
                                        <th className="px-4 py-3 text-left">Comment</th>
                                        <th className="px-4 py-3 text-left">Sentiment</th>
                                        <th className="px-4 py-3 text-left">Category</th>
                                        <th className="px-4 py-3 text-left">Category match</th>
                                        <th className="px-4 py-3 text-left">Overall score</th>
                                        <th className="px-4 py-3 text-left">Status</th>
                                        <th className="px-4 py-3 text-left">Priority</th>
                                        <th className="px-4 py-3 text-left">Team reply</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {comments.map((c) => {
                                        const flagged = isFlaggedComment(c.analysis);
                                        const needsReplyReview = pageReplyNeedsReview(c, brandNames);
                                        return (
                                        <tr
                                            key={c._id}
                                            onClick={() => openComment(c)}
                                            className={`border-t border-gray-100 hover:brightness-[0.98] cursor-pointer transition-all ${getCommentHighlightClass(c.analysis)}`}
                                        >
                                            <td className="px-4 py-3 max-w-xs">
                                                <div className="flex items-center gap-2 mb-1">
                                                    <p className="font-medium text-gray-800 truncate">{c.username || "Anonymous"}</p>
                                                    {flagged && (
                                                        <span className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border ${getFlaggedBadgeStyle(c.analysis)}`}>
                                                            {getFlaggedLabel(c.analysis)}
                                                        </span>
                                                    )}
                                                    {isLeadInquiry(c.analysis) && (
                                                        <span className="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase border bg-sky-100 text-sky-800 border-sky-200">
                                                            Lead
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-gray-500 truncate text-xs mt-0.5">{c.text}</p>
                                                <p className="text-[10px] text-gray-400 mt-1">{c.platform} · {c.timestamp ? new Date(c.timestamp).toLocaleDateString("en-IN") : "—"}</p>
                                            </td>
                                            <td className="px-4 py-3">
                                                <Badge style={SENTIMENT_STYLES[c.analysis?.sentiment] || SENTIMENT_STYLES.unreviewed}>
                                                    {c.analysis?.sentiment || "—"}
                                                </Badge>
                                            </td>
                                            <td className="px-4 py-3 text-xs text-gray-600">
                                                {getCategoryMatchLabels(c.analysis).length > 0 ? (
                                                    <div className="flex flex-wrap gap-1">
                                                        {getMatchedCategories(c.analysis).map((cat) => (
                                                            <span
                                                                key={cat}
                                                                className={`px-1.5 py-0.5 rounded text-[10px] font-medium border ${
                                                                    c.analysis?.matchedCategory === cat
                                                                        ? "bg-violet-100 text-violet-800 border-violet-200"
                                                                        : "bg-gray-50 text-gray-600 border-gray-200"
                                                                }`}
                                                            >
                                                                {CATEGORY_LABELS[cat] || cat}
                                                            </span>
                                                        ))}
                                                    </div>
                                                ) : "—"}
                                            </td>
                                            <td className="px-4 py-3">
                                                <ScoreBar value={c.analysis?.matchConfidence || 0} />
                                            </td>
                                            <td className="px-4 py-3">
                                                <ScoreBar value={c.analysis?.overallConfidence || 0} muted />
                                            </td>
                                            <td className="px-4 py-3">
                                                <Badge style={STATUS_STYLES[c.reply?.status] || STATUS_STYLES.unreviewed}>
                                                    {c.reply?.status || "unreviewed"}
                                                </Badge>
                                            </td>
                                            <td className="px-4 py-3">
                                                <Badge style={PRIORITY_STYLES_LOCAL[c.analysis?.priority] || PRIORITY_STYLES_LOCAL.normal}>
                                                    {c.analysis?.priority || "normal"}
                                                </Badge>
                                            </td>
                                            <td className="px-4 py-3">
                                                {needsReplyReview ? (
                                                    <Badge style="bg-amber-100 text-amber-800 border-amber-300">Review</Badge>
                                                ) : c.reply?.status === "replied" ? (
                                                    <Badge style={STATUS_STYLES.replied}>Posted</Badge>
                                                ) : (
                                                    <span className="text-xs text-gray-400">—</span>
                                                )}
                                            </td>
                                        </tr>
                                    );})}
                                </tbody>
                            </table>
                        </div>
                    )}

                    {pagination.totalPages > 1 && (
                        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                            <button
                                disabled={pagination.page <= 1}
                                onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}
                                className="px-3 py-1 rounded-lg border text-sm disabled:opacity-40"
                            >← Prev</button>
                            <span className="text-xs text-gray-500">Page {pagination.page} of {pagination.totalPages}</span>
                            <button
                                disabled={pagination.page >= pagination.totalPages}
                                onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
                                className="px-3 py-1 rounded-lg border text-sm disabled:opacity-40"
                            >Next →</button>
                        </div>
                    )}
                </div>
            </div>

            {selected && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setSelected(null)}>
                    <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl p-4" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-3">
                            <p className="font-bold text-gray-900">Comment review</p>
                            <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
                        </div>
                        <CommentThreadCard
                            comment={selected}
                            brandNames={brandNames}
                            onUpdated={() => { setSelected(null); refreshInbox(); }}
                        />
                    </div>
                </div>
            )}
        </div>
    );
}

function StatCard({ label, value, color, highlight }) {
    const bg = highlight === "red" ? "border-red-200 bg-red-50" : highlight === "orange" ? "border-orange-200 bg-orange-50" : highlight === "purple" ? "border-purple-200 bg-purple-50" : highlight ? "border-red-200 bg-red-50" : "border-gray-200 bg-white";
    return (
        <div className={`rounded-2xl border p-4 ${bg}`}>
            <p className="text-[10px] uppercase tracking-widest text-gray-400">{label}</p>
            <p className={`text-2xl font-bold mt-1 ${color}`}>{value ?? 0}</p>
        </div>
    );
}

function FilterSelect({ label, value, onChange, options }) {
    return (
        <div>
            <label className="text-[10px] uppercase text-gray-400 block mb-1">{label}</label>
            <select value={value} onChange={(e) => onChange(e.target.value)}
                className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm bg-white">
                {options.map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
            </select>
        </div>
    );
}

function Badge({ children, style }) {
    return <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${style}`}>{children}</span>;
}

function ScoreBar({ value, muted = false }) {
    const color = value >= 75 ? "bg-emerald-500" : value >= 50 ? "bg-amber-400" : muted ? "bg-gray-200" : "bg-gray-300";
    return (
        <div className="flex items-center gap-2">
            <div className="w-14 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                <div className={`h-full ${color} rounded-full`} style={{ width: `${Math.min(100, value)}%` }} />
            </div>
            <span className="text-xs text-gray-500 tabular-nums">{value || 0}%</span>
        </div>
    );
}

function HighlightLegend() {
    return (
        <div className="flex flex-wrap gap-4 text-xs text-gray-600 bg-white rounded-xl border border-gray-200 px-4 py-3">
            <span className="font-semibold text-gray-700">Row highlighting:</span>
            <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm bg-red-50 border-l-2 border-l-red-500 border border-red-200" /> Negative</span>
            <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm bg-orange-50 border-l-2 border-l-orange-500 border border-orange-200" /> Spam</span>
            <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm bg-purple-50 border-l-2 border-l-purple-600 border border-purple-300" /> Abuse / harassment</span>
            <span className="flex items-center gap-2"><span className="w-3 h-3 rounded-sm bg-red-100 border-l-2 border-l-red-600 border border-red-300" /> Critical</span>
        </div>
    );
}
