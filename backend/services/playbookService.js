const Page = require("../models/Page");
const Guidebook = require("../models/Guidebook");
const PlaybookSettings = require("../models/PlaybookSettings");
const { DEFAULT_GUIDEBOOK } = require("../data/defaultGuidebook");
const { DEFAULT_PLAYBOOK, mergePlaybook } = require("../data/defaultPlaybook");

function pickOverrides(stored) {
    if (!stored || typeof stored !== "object") return {};
    const out = {};
    if (stored.replyCta) out.replyCta = stored.replyCta;
    if (stored.replyCtaUrgent) out.replyCtaUrgent = stored.replyCtaUrgent;
    if (stored.neutralLeadsEnabled !== undefined && stored.neutralLeadsEnabled !== null) {
        out.neutralLeadsEnabled = stored.neutralLeadsEnabled;
    }
    if (stored.leadInquiryTriggers?.length) out.leadInquiryTriggers = stored.leadInquiryTriggers;
    if (stored.brandDisplayName) out.brandDisplayName = stored.brandDisplayName;
    return out;
}

function hasAccountOverrides(stored = {}) {
    return Boolean(
        stored.replyCta
        || stored.replyCtaUrgent
        || stored.brandDisplayName
        || stored.leadInquiryTriggers?.length
        || stored.neutralLeadsEnabled === false
    );
}

function mergePlaybookSafe(base, overrides = {}, pageName = null) {
    const safeBase = base && typeof base === "object" ? base : DEFAULT_PLAYBOOK;
    return mergePlaybook(safeBase, overrides, pageName);
}

async function loadGlobalPlaybookBase() {
    const global = await PlaybookSettings.findOne({ pageId: null }).lean();
    if (!global) {
        await seedGlobalPlaybook({ force: false });
        const seeded = await PlaybookSettings.findOne({ pageId: null }).lean();
        return mergePlaybookSafe(DEFAULT_PLAYBOOK, pickOverrides(seeded), null);
    }
    return mergePlaybookSafe(DEFAULT_PLAYBOOK, pickOverrides(global), null);
}

/** Effective playbook for an account: code defaults → global (DB) → optional account overrides → page name as brand */
async function loadPlaybook(pageId) {
    const globalBase = await loadGlobalPlaybookBase();
    if (!pageId) return globalBase;

    const page = await Page.findOne({ pageId }).lean();
    const accountStored = page?.playbook || {};
    const accountSettings = await PlaybookSettings.findOne({ pageId }).lean();
    const accountOverrides = {
        ...pickOverrides(accountStored),
        ...pickOverrides(accountSettings),
    };

    return mergePlaybookSafe(globalBase, accountOverrides, page?.name);
}

async function getPlaybookMeta(pageId) {
    const globalRow = await PlaybookSettings.findOne({ pageId: null }).lean();
    const globalBase = mergePlaybookSafe(DEFAULT_PLAYBOOK, pickOverrides(globalRow), null);

    if (!pageId) {
        return {
            playbook: globalBase,
            globalPlaybook: globalBase,
            accountOverrides: {},
            usesAccountOverrides: false,
        };
    }

    const page = await Page.findOne({ pageId }).lean();
    const accountStored = page?.playbook || {};
    const accountSettings = await PlaybookSettings.findOne({ pageId }).lean();
    const accountOverrides = {
        ...pickOverrides(accountStored),
        ...pickOverrides(accountSettings),
    };
    const effective = mergePlaybookSafe(globalBase, accountOverrides, page?.name);

    return {
        playbook: effective,
        globalPlaybook: globalBase,
        accountOverrides,
        usesAccountOverrides: hasAccountOverrides(accountStored) || hasAccountOverrides(accountSettings),
        pageName: page?.name,
    };
}

async function saveGlobalPlaybook(body) {
    return PlaybookSettings.findOneAndUpdate(
        { pageId: null },
        {
            $set: {
                pageId: null,
                replyCta: body.replyCta,
                replyCtaUrgent: body.replyCtaUrgent,
                neutralLeadsEnabled: body.neutralLeadsEnabled ?? true,
                leadInquiryTriggers: body.leadInquiryTriggers || [],
                brandDisplayName: body.brandDisplayName || undefined,
            },
        },
        { upsert: true, new: true, runValidators: true }
    ).lean();
}

async function saveAccountPlaybook(pageId, body) {
    await Page.findOneAndUpdate(
        { pageId },
        {
            $set: {
                playbook: {
                    replyCta: body.replyCta || undefined,
                    replyCtaUrgent: body.replyCtaUrgent || undefined,
                    neutralLeadsEnabled: body.neutralLeadsEnabled,
                    leadInquiryTriggers: body.leadInquiryTriggers || [],
                    brandDisplayName: body.brandDisplayName || undefined,
                },
            },
        },
        { new: true }
    );
    return loadPlaybook(pageId);
}

async function clearAccountPlaybook(pageId) {
    await Page.findOneAndUpdate({ pageId }, { $unset: { playbook: 1 } });
    await PlaybookSettings.deleteOne({ pageId });
    return loadPlaybook(pageId);
}

function resolveBrandName(pageName, playbook) {
    return playbook?.brandDisplayName || pageName || "our team";
}

async function seedGlobalPlaybook(options = {}) {
    const { force = false } = options;
    const filter = { pageId: null };

    if (force) {
        await PlaybookSettings.findOneAndUpdate(
            filter,
            {
                $set: {
                    pageId: null,
                    replyCta: DEFAULT_PLAYBOOK.replyCta,
                    replyCtaUrgent: DEFAULT_PLAYBOOK.replyCtaUrgent,
                    neutralLeadsEnabled: DEFAULT_PLAYBOOK.neutralLeadsEnabled,
                    leadInquiryTriggers: [],
                },
            },
            { upsert: true }
        );
    } else {
        await PlaybookSettings.findOneAndUpdate(
            filter,
            {
                $setOnInsert: {
                    pageId: null,
                    replyCta: DEFAULT_PLAYBOOK.replyCta,
                    replyCtaUrgent: DEFAULT_PLAYBOOK.replyCtaUrgent,
                    neutralLeadsEnabled: DEFAULT_PLAYBOOK.neutralLeadsEnabled,
                    leadInquiryTriggers: [],
                },
            },
            { upsert: true }
        );
    }

    console.log(`✅ Global playbook seeded${force ? " (forced reset)" : ""}`);
}

async function createGuidebookOverride(pageId, category, patch = {}) {
    const global = await Guidebook.findOne({ pageId: null, category }).lean()
        || DEFAULT_GUIDEBOOK.find((e) => e.category === category);
    if (!global) throw new Error(`Unknown category: ${category}`);

    const { _id, createdAt, updatedAt, ...base } = global;
    const entry = {
        ...base,
        ...patch,
        pageId,
        category,
        isActive: patch.isActive ?? true,
    };

    return Guidebook.findOneAndUpdate(
        { pageId, category },
        { $set: entry },
        { upsert: true, new: true, runValidators: true }
    );
}

async function cloneGuidebookToPage(pageId) {
    const existing = await Guidebook.find({ pageId }).select("category").lean();
    const have = new Set(existing.map((e) => e.category));
    let created = 0;

    for (const entry of DEFAULT_GUIDEBOOK) {
        if (have.has(entry.category)) continue;
        await createGuidebookOverride(pageId, entry.category, {});
        created += 1;
    }

    return { created, skipped: have.size };
}

module.exports = {
    loadPlaybook,
    loadGlobalPlaybookBase,
    getPlaybookMeta,
    saveGlobalPlaybook,
    saveAccountPlaybook,
    clearAccountPlaybook,
    seedGlobalPlaybook,
    resolveBrandName,
    createGuidebookOverride,
    cloneGuidebookToPage,
    DEFAULT_PLAYBOOK,
};
