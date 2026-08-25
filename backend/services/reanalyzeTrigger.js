const Page = require("../models/Page");
const IgProfile = require("../models/IgProfile");
const Comment = require("../models/Comment");
const { processCommentsForPage } = require("./commentProcessor");
const { getBrandNames } = require("../utils/commentHelpers");

async function reanalyzePage(pageId) {
    const [page, igProfile] = await Promise.all([
        Page.findOne({ pageId }),
        IgProfile.findOne({ pageId }),
    ]);
    const brandNames = getBrandNames(page?.name, igProfile?.username);
    return processCommentsForPage(pageId, page?.name || "our team", brandNames);
}

/** Fire-and-forget — not a cron; runs once when guidebook/review changes */
function schedulePageReanalysis(pageId, reason = "update") {
    if (!pageId) return scheduleAllPagesReanalysis(reason);
    setImmediate(async () => {
        try {
            const result = await reanalyzePage(pageId);
            console.log(`✅ Auto re-analysis (${reason}, ${pageId}): ${result.processed}/${result.total}`);
        } catch (err) {
            console.error(`⚠ Auto re-analysis failed (${reason}, ${pageId}):`, err.message);
        }
    });
}

function scheduleAllPagesReanalysis(reason = "global guidebook") {
    setImmediate(async () => {
        try {
            const pageIds = await Comment.distinct("pageId");
            let processed = 0;
            for (const pid of pageIds) {
                const result = await reanalyzePage(pid);
                processed += result.processed;
            }
            console.log(`✅ Auto re-analysis (${reason}): ${pageIds.length} pages, ${processed} comments`);
        } catch (err) {
            console.error(`⚠ Auto re-analysis failed (${reason}):`, err.message);
        }
    });
}

function scheduleGuidebookReanalysis(pageId, reason = "guidebook") {
    if (pageId) schedulePageReanalysis(pageId, reason);
    else scheduleAllPagesReanalysis(reason);
}

module.exports = {
    reanalyzePage,
    schedulePageReanalysis,
    scheduleAllPagesReanalysis,
    scheduleGuidebookReanalysis,
};
