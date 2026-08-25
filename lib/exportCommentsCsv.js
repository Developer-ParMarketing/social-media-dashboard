import API from "@/services/api";

/**
 * Download comments CSV for a page, optionally filtered by sentiment and reply status.
 * @param {string} pageId
 * @param {{ sentiment?: string, status?: string, hasReply?: string, search?: string }} filters
 */
export async function downloadCommentsCsv(pageId, filters = {}) {
    const params = { format: "csv", ...filters };
    Object.keys(params).forEach((key) => {
        const value = params[key];
        if (value === "all" || value === "false" || value === "" || value == null) {
            delete params[key];
        }
    });

    const res = await API.get(`/comments/${pageId}/report`, {
        params,
        responseType: "blob",
    });

    const blob = new Blob([res.data], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;

    const sentiment = filters.sentiment && filters.sentiment !== "all" ? filters.sentiment : "all";
    const status = filters.status && filters.status !== "all" ? filters.status : "all";
    link.download = `comments-${pageId}-${sentiment}-${status}.csv`;

    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

export const EXPORT_SENTIMENT_OPTIONS = [
    ["all", "All sentiments"],
    ["negative", "Negative"],
    ["positive", "Positive"],
    ["neutral", "Neutral"],
    ["spam", "Spam"],
    ["abuse", "Abuse"],
    ["unreviewed", "Unreviewed"],
];

export const EXPORT_STATUS_OPTIONS = [
    ["all", "All statuses"],
    ["suggested", "Suggested"],
    ["unreviewed", "Unreviewed"],
    ["approved", "Approved"],
    ["rejected", "Rejected"],
    ["replied", "Replied"],
    ["ignored", "Ignored"],
];
