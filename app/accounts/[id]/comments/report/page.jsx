"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import API from "@/services/api";
import CopyReplyButton from "@/components/CopyReplyButton";
import {
    downloadCommentsCsv,
    EXPORT_SENTIMENT_OPTIONS,
    EXPORT_STATUS_OPTIONS,
} from "@/lib/exportCommentsCsv";
import {
    CATEGORY_LABELS,
    SENTIMENT_STYLES,
    STATUS_STYLES,
    getCommentHighlightClass,
    isFlaggedComment,
    getFlaggedLabel,
} from "@/lib/commentModeration";

const PAGE_SIZE = 10;

export default function CommentReportPage() {
    const router = useRouter();
    const { id: pageId } = useParams();

    const [rows, setRows] = useState([]);
    const [summary, setSummary] = useState(null);
    const [repliesSyncedAt, setRepliesSyncedAt] = useState(null);
    const [loading, setLoading] = useState(true);
    const [filters, setFilters] = useState({ sentiment: "all", status: "all", hasReply: "false", search: "" });
    const [searchInput, setSearchInput] = useState("");
    const [pagination, setPagination] = useState({ page: 1, totalPages: 1, total: 0 });
    const [expandedRows, setExpandedRows] = useState(() => new Set());
    const [exporting, setExporting] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    const toggleRow = (id) => {
        setExpandedRows((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const fetchReport = useCallback(async () => {
        if (!pageId) return;
        setLoading(true);
        try {
            const params = { page: pagination.page, limit: PAGE_SIZE, ...filters };
            Object.keys(params).forEach((k) => {
                if (params[k] === "all" || params[k] === "false") delete params[k];
            });
            const res = await API.get(`/comments/${pageId}/report`, { params });
            setRows(res.data.data);
            setSummary(res.data.summary);
            setRepliesSyncedAt(res.data.repliesSyncedAt || null);
            setPagination(res.data.pagination);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [pageId, filters, pagination.page]);

    useEffect(() => { fetchReport(); }, [fetchReport]);

    useEffect(() => {
        const timer = setTimeout(() => {
            const nextSearch = searchInput.trim();
            setFilters((f) => (f.search === nextSearch ? f : { ...f, search: nextSearch }));
        }, 300);
        return () => clearTimeout(timer);
    }, [searchInput]);

    useEffect(() => {
        setPagination((p) => ({ ...p, page: 1 }));
    }, [filters.search]);

    useEffect(() => {
        setExpandedRows(new Set());
    }, [pagination.page]);

    const updateFilters = (patch) => {
        setFilters((f) => ({ ...f, ...patch }));
        setPagination((p) => ({ ...p, page: 1 }));
    };

    const exportCsv = async () => {
        if (!pageId) return;
        setExporting(true);
        try {
            await downloadCommentsCsv(pageId, filters);
        } catch (err) {
            console.error(err);
            alert(err.response?.data?.error || err.message || "Export failed");
        } finally {
            setExporting(false);
        }
    };

    const refreshReport = async () => {
        setRefreshing(true);
        try {
            await fetchReport();
        } finally {
            setRefreshing(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#f5f5f0] font-['DM_Sans',sans-serif]">
            <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Syne:wght@700;800&display=swap" rel="stylesheet" />

            <div className="sticky top-0 z-40 bg-white/90 backdrop-blur border-b border-gray-200 px-6 py-3 flex items-center gap-3 flex-wrap">
                <button onClick={() => router.back()} className="w-10 h-10 rounded-xl border border-gray-200 bg-white hover:bg-gray-50">←</button>
                <div>
                    <h1 className="font-['Syne'] text-lg font-bold text-gray-900">Comments Report</h1>
                    <p className="text-xs text-gray-500">All comments · generated replies · reply status</p>
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
                    <Link href={`/accounts/${pageId}/comments`} className="px-3 py-1.5 rounded-xl border border-gray-200 text-sm font-medium hover:bg-gray-50">
                        Reply Desk
                    </Link>
                    <button
                        type="button"
                        onClick={refreshReport}
                        disabled={refreshing || loading}
                        className="px-3 py-1.5 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 disabled:opacity-50"
                    >
                        {refreshing ? "Refreshing…" : "↻ Refresh"}
                    </button>
                </div>
            </div>

            <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-6 space-y-6">
                {summary && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                        <MiniStat label="Total" value={summary.total} />
                        <MiniStat label="Negative" value={summary.negative} color="text-red-600" />
                        <MiniStat label="Spam" value={summary.spam} color="text-orange-600" />
                        <MiniStat label="Abuse" value={summary.abuse} color="text-purple-700" />
                        <MiniStat label="Suggested Replies" value={summary.withSuggestedReply} color="text-blue-600" />
                        <MiniStat label="Final Replies" value={summary.withFinalReply} color="text-indigo-600" />
                        <MiniStat label="Posted" value={summary.replied} color="text-emerald-600" />
                    </div>
                )}

                <HighlightLegend />

                <div className="bg-white rounded-2xl border border-gray-200 p-4 space-y-3">
                    <div>
                        <label className="text-[10px] uppercase text-gray-400 block mb-1">Search</label>
                        <input
                            type="search"
                            value={searchInput}
                            onChange={(e) => setSearchInput(e.target.value)}
                            placeholder="Search comment, username, or reply text…"
                            className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400"
                        />
                    </div>
                    <div className="flex flex-wrap gap-3 items-end">
                    <FilterSelect label="Sentiment" value={filters.sentiment} onChange={(v) => updateFilters({ sentiment: v })}
                        options={EXPORT_SENTIMENT_OPTIONS} />
                    <FilterSelect label="Reply Status" value={filters.status} onChange={(v) => updateFilters({ status: v })}
                        options={EXPORT_STATUS_OPTIONS} />
                    <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                        <input type="checkbox" checked={filters.hasReply === "true"}
                            onChange={(e) => updateFilters({ hasReply: e.target.checked ? "true" : "false" })} className="rounded" />
                        Only comments with generated replies
                    </label>
                    <button
                        type="button"
                        onClick={exportCsv}
                        disabled={exporting}
                        className="ml-auto px-4 py-2 rounded-xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
                    >
                        {exporting ? "Exporting…" : "↓ Export CSV"}
                    </button>
                    </div>
                </div>
                <p className="text-xs text-gray-500 -mt-3">
                    Search and filters apply to the table and CSV export (all matching rows, not just this page).
                </p>

                <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
                    {loading ? (
                        <p className="p-8 text-center text-gray-400">Loading report…</p>
                    ) : rows.length === 0 ? (
                        <p className="p-12 text-center text-gray-400">
                            {filters.search ? `No comments match "${filters.search}"` : "No comments found"}
                        </p>
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm min-w-[1000px]">
                                <thead className="bg-gray-50 text-gray-500 text-[10px] uppercase">
                                    <tr>
                                        <th className="px-3 py-3 text-left">Date</th>
                                        <th className="px-3 py-3 text-left">User</th>
                                        <th className="px-3 py-3 text-left">Comment</th>
                                        <th className="px-3 py-3 text-left">Sentiment</th>
                                        <th className="px-3 py-3 text-left">Category</th>
                                        <th className="px-3 py-3 text-left">Suggested Reply</th>
                                        <th className="px-3 py-3 text-left">Final / Posted Reply</th>
                                        <th className="px-3 py-3 text-left">Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {rows.map((r) => (
                                        <ReportRow
                                            key={r.id}
                                            row={r}
                                            expanded={expandedRows.has(r.id)}
                                            onToggle={() => toggleRow(r.id)}
                                        />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                    {!loading && pagination.total > 0 && (
                        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100">
                            <p className="text-xs text-gray-500">
                                Showing {(pagination.page - 1) * PAGE_SIZE + 1}–{Math.min(pagination.page * PAGE_SIZE, pagination.total)} of {pagination.total}
                            </p>
                            <div className="flex items-center gap-3">
                                <button
                                    type="button"
                                    disabled={pagination.page <= 1}
                                    onClick={() => setPagination((p) => ({ ...p, page: p.page - 1 }))}
                                    className="px-3 py-1 rounded-lg border text-sm disabled:opacity-40 hover:bg-gray-50"
                                >
                                    ← Prev
                                </button>
                                <span className="text-xs text-gray-500">
                                    Page {pagination.page} of {pagination.totalPages}
                                </span>
                                <button
                                    type="button"
                                    disabled={pagination.page >= pagination.totalPages}
                                    onClick={() => setPagination((p) => ({ ...p, page: p.page + 1 }))}
                                    className="px-3 py-1 rounded-lg border text-sm disabled:opacity-40 hover:bg-gray-50"
                                >
                                    Next →
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function CollapsibleText({ text, expanded, className = "" }) {
    if (!text) return null;

    return (
        <p
            className={`text-xs leading-relaxed whitespace-pre-wrap break-words ${className} ${
                expanded ? "" : "line-clamp-3"
            }`}
        >
            {text}
        </p>
    );
}

function ReportRow({ row: r, expanded, onToggle }) {
    const highlight = getCommentHighlightClass({ sentiment: r.sentiment, priority: r.priority });

    return (
        <tr
            role="button"
            tabIndex={0}
            aria-expanded={expanded}
            onClick={onToggle}
            onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onToggle();
                }
            }}
            className={`border-t border-gray-100 cursor-pointer transition-colors hover:bg-black/[0.02] ${highlight} ${expanded ? "ring-1 ring-inset ring-gray-200" : ""}`}
        >
            <td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap align-top">
                <span className="inline-flex items-start gap-1.5">
                    <span className={`mt-0.5 text-[10px] text-gray-400 transition-transform ${expanded ? "rotate-90" : ""}`} aria-hidden>
                        ▶
                    </span>
                    <span>
                        {r.date ? new Date(r.date).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}
                        <br />
                        <span className="text-[10px] opacity-60">{r.platform}</span>
                    </span>
                </span>
            </td>
            <td className="px-3 py-3 align-top font-medium text-gray-800 text-xs">{r.username}</td>
            <td className="px-3 py-3 align-top max-w-[200px]">
                <CollapsibleText text={r.comment} expanded={expanded} className="text-gray-800" />
            </td>
            <td className="px-3 py-3 align-top">
                <Badge style={SENTIMENT_STYLES[r.sentiment] || SENTIMENT_STYLES.unreviewed}>{r.sentiment}</Badge>
            </td>
            <td className="px-3 py-3 align-top text-xs text-gray-600">
                {r.categoryLabels || r.categoryLabel || "—"}
            </td>
            <td className="px-3 py-3 align-top max-w-[220px]">
                {r.suggestedReply ? (
                    <div className="relative">
                        <CopyReplyButton text={r.suggestedReply} className="absolute top-0 right-0 z-10" />
                        <CollapsibleText
                            text={r.suggestedReply}
                            expanded={expanded}
                            className="text-blue-800 bg-blue-50 rounded-lg p-2 pr-14"
                        />
                    </div>
                ) : (
                    <span className="text-xs text-gray-300">—</span>
                )}
            </td>
            <td className="px-3 py-3 align-top max-w-[220px]">
                {r.finalReply ? (
                    <div>
                        {r.replyStatus === "approved" && (
                            <p className="text-[10px] font-bold uppercase text-indigo-700 mb-1">Approved</p>
                        )}
                        {r.replyStatus === "rejected" && (
                            <p className="text-[10px] font-bold uppercase text-rose-700 mb-1">Rejected</p>
                        )}
                        {r.replyStatus === "replied" && (
                            <p className="text-[10px] font-bold uppercase text-emerald-700 mb-1">Posted</p>
                        )}
                        <CollapsibleText
                            text={r.finalReply}
                            expanded={expanded}
                            className={
                                r.replyStatus === "rejected"
                                    ? "text-rose-800 bg-rose-50 rounded-lg p-2"
                                    : r.replyStatus === "approved"
                                        ? "text-indigo-800 bg-indigo-50 rounded-lg p-2"
                                        : "text-emerald-800 bg-emerald-50 rounded-lg p-2"
                            }
                        />
                        {r.reviewedAt && (
                            <p className="text-[10px] text-gray-400 mt-1">
                                Reviewed {new Date(r.reviewedAt).toLocaleDateString("en-IN")}
                            </p>
                        )}
                        {r.repliedAt && r.replyStatus === "replied" && (
                            <p className="text-[10px] text-gray-400 mt-1">
                                Posted {new Date(r.repliedAt).toLocaleDateString("en-IN")}
                            </p>
                        )}
                    </div>
                ) : (
                    <span className="text-xs text-gray-300">—</span>
                )}
            </td>
            <td className="px-3 py-3 align-top">
                <Badge style={STATUS_STYLES[r.replyStatus] || STATUS_STYLES.unreviewed}>{r.replyStatus}</Badge>
                {!expanded && (r.comment?.length > 120 || r.suggestedReply?.length > 120 || r.finalReply?.length > 120) && (
                    <p className="text-[10px] text-gray-400 mt-1">Click to expand</p>
                )}
            </td>
        </tr>
    );
}

function HighlightLegend() {
    return (
        <div className="flex flex-wrap gap-4 text-xs text-gray-600 bg-white rounded-xl border border-gray-200 px-4 py-3">
            <span className="font-semibold text-gray-700">Highlighting:</span>
            <span className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-sm bg-red-100 border border-red-300" /> Negative comments
            </span>
            <span className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-sm bg-orange-100 border border-orange-300" /> Spam
            </span>
            <span className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-sm bg-purple-100 border border-purple-300" /> Abuse / harassment
            </span>
            <span className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-sm bg-red-200 border border-red-400" /> Critical priority
            </span>
        </div>
    );
}

function MiniStat({ label, value, color = "text-gray-800" }) {
    return (
        <div className="rounded-xl border border-gray-200 bg-white p-3">
            <p className="text-[10px] uppercase text-gray-400">{label}</p>
            <p className={`text-xl font-bold ${color}`}>{value ?? 0}</p>
        </div>
    );
}

function FilterSelect({ label, value, onChange, options }) {
    return (
        <div>
            <label className="text-[10px] uppercase text-gray-400 block mb-1">{label}</label>
            <select value={value} onChange={(e) => onChange(e.target.value)} className="rounded-xl border border-gray-200 px-3 py-1.5 text-sm bg-white">
                {options.map(([val, lbl]) => <option key={val} value={val}>{lbl}</option>)}
            </select>
        </div>
    );
}

function Badge({ children, style }) {
    return <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${style}`}>{children}</span>;
}
