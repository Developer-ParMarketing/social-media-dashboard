"use client";

import { useEffect, useState } from "react";
import API from "@/services/api";
import {
    CATEGORY_LABELS,
    SENTIMENT_STYLES,
    STATUS_STYLES,
    getCommentHighlightClass,
    isFlaggedComment,
    getFlaggedLabel,
    getFlaggedBadgeStyle,
    needsCustomerServiceReply,
    shouldShowSuggestedReply,
    getSuggestedReplyLabel,
    isAbuseComment,
    isSpamComment,
    getMatchedCategories,
    isPrimaryCategory,
    getPageReplyText,
    pageReplyNeedsReview,
    extractPageReplies,
    getMatchInsight,
    isLeadInquiry,
    isReplyReviewLocked,
    getPrimaryCategory,
} from "@/lib/commentModeration";
import CopyReplyButton from "@/components/CopyReplyButton";

function Badge({ children, style }) {
    return <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${style}`}>{children}</span>;
}

/** Inline comment with analysis, team reply vs guidebook suggestion */
export default function CommentThreadCard({ comment, brandNames = [], compact = false, onUpdated }) {
    const [commentView, setCommentView] = useState(comment);
    const [replyText, setReplyText] = useState(
        comment.reply?.finalReply || comment.reply?.suggestedReply || ""
    );
    const [saving, setSaving] = useState(false);
    const [addingExample, setAddingExample] = useState(false);
    const [expanded, setExpanded] = useState(!compact || pageReplyNeedsReview(comment, brandNames));

    useEffect(() => {
        setCommentView(comment);
    }, [comment]);

    const a = commentView.analysis || {};
    const insight = getMatchInsight(a);
    const r = commentView.reply || {};
    const reviewLocked = isReplyReviewLocked(r);
    const flagged = isFlaggedComment(a);
    const csReply = needsCustomerServiceReply(a);
    const showSuggested = shouldShowSuggestedReply(a);
    const suggestedLabel = getSuggestedReplyLabel(a);
    const abuse = isAbuseComment(a);
    const spam = isSpamComment(a);
    const pageReply = getPageReplyText(commentView, brandNames);
    const needsReview = pageReplyNeedsReview(commentView, brandNames);
    const allPageReplies = extractPageReplies(commentView, brandNames);

    useEffect(() => {
        setReplyText(commentView.reply?.finalReply || commentView.reply?.suggestedReply || "");
    }, [
        commentView._id,
        commentView.reply?.finalReply,
        commentView.reply?.suggestedReply,
        commentView.reply?.status,
    ]);

    const handleAddToGuidebook = async () => {
        if (!commentView._id) return;
        const category = getPrimaryCategory(a);
        if (!category) {
            alert("No category on this comment — refresh analysis first.");
            return;
        }
        setAddingExample(true);
        try {
            const res = await API.post(`/comments/item/${commentView._id}/add-to-guidebook`, { category });
            const { wasNew, exampleCount, category: savedCategory } = res.data.data || {};
            const label = CATEGORY_LABELS[savedCategory] || savedCategory;
            if (wasNew) {
                alert(`Added to ${label} examples (${exampleCount} total). Similar comments will match better after re-analysis.`);
            } else {
                alert(`Already in ${label} examples (${exampleCount} total).`);
            }
        } catch (err) {
            alert(err.response?.data?.error || err.message);
        } finally {
            setAddingExample(false);
        }
    };

    const handleAction = async (action) => {
        if (!commentView._id || reviewLocked) return;
        setSaving(true);
        try {
            const res = await API.patch(`/comments/item/${commentView._id}/review`, {
                action,
                finalReply: replyText,
                reviewedBy: "admin",
            });
            const learning = res.data?.learning;
            if (learning?.learned) {
                if (action === "approve") {
                    alert(`Approved — saved as preferred reply for ${CATEGORY_LABELS[learning.category] || learning.category}. Similar comments will update shortly.`);
                } else if (action === "reject") {
                    alert(`Rejected — AI will avoid similar replies. Other suggestions will update shortly.`);
                }
            } else if (res.data?.reanalysisScheduled) {
                alert("Suggestions for this account will refresh shortly.");
            }
            if (res.data?.data) {
                setCommentView(res.data.data);
            }
            onUpdated?.(res.data?.data);
        } catch (err) {
            alert(err.response?.data?.error || err.message);
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className={`rounded-xl border p-3 transition-all ${getCommentHighlightClass(a)} ${flagged ? "" : "bg-gray-50 border-gray-100"}`}>
            <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-semibold text-gray-900">{commentView.username || "Anonymous"}</span>
                        {flagged && (
                            <Badge style={getFlaggedBadgeStyle(a)}>
                                {getFlaggedLabel(a)}
                            </Badge>
                        )}
                        {needsReview && (
                            <Badge style="bg-amber-100 text-amber-800 border-amber-300">Review reply</Badge>
                        )}
                        {isLeadInquiry(a) && (
                            <Badge style="bg-sky-100 text-sky-800 border-sky-200">Lead inquiry</Badge>
                        )}
                        {getMatchedCategories(a).map((cat) => (
                            <Badge
                                key={cat}
                                style={isPrimaryCategory(a, cat)
                                    ? "bg-violet-200 text-violet-900 border-violet-300"
                                    : "bg-violet-50 text-violet-700 border-violet-200"}
                            >
                                {CATEGORY_LABELS[cat]}{isPrimaryCategory(a, cat) ? " · primary" : ""}
                            </Badge>
                        ))}
                        {a.sentiment && !flagged && (
                            <Badge style={SENTIMENT_STYLES[a.sentiment] || SENTIMENT_STYLES.neutral}>{a.sentiment}</Badge>
                        )}
                    </div>
                    <p className="text-[10px] text-gray-400 mt-0.5">
                        {commentView.timestamp ? new Date(commentView.timestamp).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : ""}
                        {r.status && (
                            <>
                                {" · "}
                                <Badge style={STATUS_STYLES[r.status] || STATUS_STYLES.unreviewed}>{r.status}</Badge>
                            </>
                        )}
                    </p>
                </div>
                {compact && (
                    <button type="button" onClick={() => setExpanded((e) => !e)} className="text-xs text-indigo-600 font-medium shrink-0">
                        {expanded ? "Less" : "Details"}
                    </button>
                )}
            </div>

            <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap break-words">{commentView.text || "—"}</p>

            {compact && pageReply && !expanded && (
                <p className={`mt-2 text-xs leading-relaxed line-clamp-2 ${needsReview ? "text-amber-800 bg-amber-50 rounded-lg px-2 py-1 border border-amber-100" : "text-emerald-700"}`}>
                    ↩ {pageReply}
                </p>
            )}

            {expanded && (
                <div className="mt-3 space-y-3 border-t border-gray-200/80 pt-3">
                    {insight && (flagged || isLeadInquiry(a)) && (
                        <div className="rounded-lg border border-violet-100 bg-violet-50/60 px-3 py-2.5 text-xs space-y-1.5">
                            <p className="font-bold uppercase text-violet-800 text-[10px]">Why this was classified</p>
                            {insight.primaryCategory && (
                                <p className="text-violet-900">
                                    <span className="text-violet-600">Primary:</span>{" "}
                                    {CATEGORY_LABELS[insight.primaryCategory] || insight.primaryCategory}
                                </p>
                            )}
                            {insight.triggers?.length > 0 && (
                                <p className="text-violet-800">
                                    <span className="text-violet-600">Signals:</span>{" "}
                                    {insight.triggers.slice(0, 6).join(" · ")}
                                </p>
                            )}
                            {(insight.matchConfidence != null || insight.overallConfidence != null) && (
                                <p className="text-violet-700">
                                    Category match: {insight.matchConfidence ?? "—"}% · Overall score: {insight.overallConfidence ?? "—"}%
                                    {insight.classificationMethod ? ` · ${insight.classificationMethod}` : ""}
                                </p>
                            )}
                            {insight.complaintFallbackUsed && (
                                <p className="text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                                    ⚠ Generic complaint fallback — add triggers or an example in the guidebook for better replies.
                                </p>
                            )}
                        </div>
                    )}

                    {pageReply && (
                        <div>
                            <p className="text-[10px] font-bold uppercase text-emerald-700 mb-1">Your team&apos;s reply (on platform)</p>
                            <div className={`rounded-lg p-2.5 text-xs leading-relaxed ${needsReview ? "bg-amber-50 border border-amber-200 text-amber-900" : "bg-emerald-50 border border-emerald-100 text-emerald-900"}`}>
                                {pageReply}
                            </div>
                            {allPageReplies.length > 1 && (
                                <p className="text-[10px] text-gray-400 mt-1">+{allPageReplies.length - 1} more team reply(s)</p>
                            )}
                        </div>
                    )}

                    {(r.suggestedReply || replyText) && showSuggested && (
                        <div>
                            <p className={`text-[10px] font-bold uppercase mb-1 ${spam ? "text-orange-700" : abuse ? "text-purple-700" : "text-blue-700"}`}>
                                {pageReply && csReply ? "Recommended reply (guidebook)" : suggestedLabel}
                            </p>
                            <div className="relative">
                                <CopyReplyButton text={replyText} className="absolute top-1.5 right-1.5 z-10" />
                                <textarea
                                    value={replyText}
                                    onChange={(e) => setReplyText(e.target.value)}
                                    readOnly={reviewLocked}
                                    rows={3}
                                    className={`w-full rounded-lg border p-2.5 pr-14 text-xs text-gray-800 focus:outline-none resize-none ${
                                    reviewLocked ? "cursor-default opacity-90" : "focus:ring-2"
                                } ${
                                    reviewLocked && r.status === "rejected"
                                        ? "border-rose-200 bg-rose-50/50"
                                        : reviewLocked && r.status === "approved"
                                            ? "border-indigo-200 bg-indigo-50/50"
                                            : spam
                                        ? "border-orange-200 bg-orange-50/50 focus:ring-orange-300"
                                        : abuse
                                            ? "border-purple-200 bg-purple-50/50 focus:ring-purple-300"
                                            : "border-blue-200 bg-blue-50/50 focus:ring-blue-300"
                                }`}
                                />
                            </div>
                        </div>
                    )}

                    {abuse && !r.suggestedReply && (
                        <div className="rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 text-xs text-purple-900">
                            <p className="font-semibold">Internal escalation — no public CS reply</p>
                            <p className="mt-1 text-purple-800/90">
                                {a.recommendedAction === "escalate_legal"
                                    ? "Flagged for legal review (threat detected). Consider hiding the comment on-platform."
                                    : "Flagged for HR / moderation review. Do not reply with a customer-service template."}
                            </p>
                            {a.matchedTriggers?.length > 0 && (
                                <p className="mt-1 text-[10px] text-purple-700/80">Matched: {a.matchedTriggers.join(", ")}</p>
                            )}
                        </div>
                    )}

                    {spam && !r.suggestedReply && (
                        <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-900">
                            <p className="font-semibold">Spam — hide on platform</p>
                            <p className="mt-1 text-orange-800/90">Mark reviewed after hiding on-platform.</p>
                        </div>
                    )}

                    {showSuggested && flagged && !r.suggestedReply && !pageReply && (
                        <p className="text-[10px] text-amber-700">No suggested reply yet — click Re-analyze All in Reply Desk.</p>
                    )}

                    {pageReply && csReply && r.suggestedReply && needsReview && (
                        <p className="text-[10px] text-amber-700 bg-amber-50 rounded-lg px-2 py-1.5 border border-amber-100">
                            The reply on the platform differs from the guidebook suggestion — please verify it&apos;s correct.
                        </p>
                    )}

                    {!pageReply && csReply && flagged && r.suggestedReply && (
                        <p className="text-[10px] text-red-600">No team reply yet on this flagged comment.</p>
                    )}

                    {pageReply && csReply && !needsReview && (
                        <p className="text-[10px] text-emerald-700 bg-emerald-50 rounded-lg px-2 py-1.5 border border-emerald-100">
                            Team reply is on the platform{r.suggestedReply ? " and looks consistent with the guidebook" : ""}.
                        </p>
                    )}

                    {commentView._id && commentView.text?.trim() && getPrimaryCategory(a) && (
                        <button
                            type="button"
                            disabled={addingExample}
                            onClick={handleAddToGuidebook}
                            className="px-3 py-1.5 rounded-lg border border-violet-200 bg-violet-50 text-violet-800 text-[11px] font-semibold hover:bg-violet-100 disabled:opacity-50"
                        >
                            {addingExample ? "Adding…" : "+ Add to guidebook examples"}
                        </button>
                    )}

                    {reviewLocked && r.finalReply && (
                        <div className={`rounded-lg border px-3 py-2 text-xs ${
                            r.status === "approved"
                                ? "border-indigo-200 bg-indigo-50 text-indigo-900"
                                : r.status === "rejected"
                                    ? "border-rose-200 bg-rose-50 text-rose-900"
                                    : "border-gray-200 bg-gray-50 text-gray-700"
                        }`}>
                            <p className="font-semibold capitalize">
                                {r.status === "approved" && "Approved — saved for guidebook learning"}
                                {r.status === "rejected" && "Rejected — AI will avoid this reply style"}
                                {r.status === "ignored" && "Marked reviewed (no reply approved)"}
                                {r.status === "replied" && "Posted on platform"}
                            </p>
                            {r.reviewedAt && (
                                <p className="text-[10px] opacity-70 mt-0.5">
                                    {new Date(r.reviewedAt).toLocaleString("en-IN")}
                                    {r.reviewedBy ? ` · ${r.reviewedBy}` : ""}
                                </p>
                            )}
                        </div>
                    )}

                    {commentView._id && flagged && !reviewLocked && (
                        <div className="flex flex-wrap gap-2">
                            {csReply && replyText.trim() && (
                                <>
                                    <button type="button" disabled={saving} onClick={() => handleAction("update_reply")}
                                        className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-[11px] font-semibold hover:bg-blue-700 disabled:opacity-50">
                                        Save draft
                                    </button>
                                    <button type="button" disabled={saving} onClick={() => handleAction("approve")}
                                        className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-[11px] font-semibold hover:bg-emerald-700 disabled:opacity-50">
                                        Approve
                                    </button>
                                    <button type="button" disabled={saving} onClick={() => handleAction("reject")}
                                        className="px-3 py-1.5 rounded-lg border border-rose-200 bg-rose-50 text-rose-800 text-[11px] font-semibold hover:bg-rose-100 disabled:opacity-50">
                                        Reject
                                    </button>
                                </>
                            )}
                            {(!csReply || !replyText.trim()) && (
                                <button type="button" disabled={saving} onClick={() => handleAction("ignore")}
                                    className="px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 text-[11px] font-semibold hover:bg-gray-50 disabled:opacity-50">
                                    Mark reviewed
                                </button>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

export function CommentHighlightLegend({ className = "" }) {
    return (
        <div className={`flex flex-wrap gap-3 text-[10px] text-gray-500 ${className}`}>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-50 border-l-2 border-l-red-500 border border-red-200" /> Negative</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-orange-50 border-l-2 border-l-orange-500 border border-orange-200" /> Spam</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-purple-50 border-l-2 border-l-purple-600 border border-purple-300" /> Abuse</span>
            <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-50 border border-amber-300" /> Reply needs review</span>
        </div>
    );
}
