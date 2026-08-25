#!/usr/bin/env node
/**
 * Seed global guidebook + playbook into MongoDB.
 *
 * Usage:
 *   node scripts/setupGuidebook.js          # add missing categories only
 *   node scripts/setupGuidebook.js --force  # reset global defaults to latest templates
 */
require("dotenv").config();

const mongoose = require("mongoose");
const { seedDefaultGuidebook } = require("../services/commentProcessor");
const { seedGlobalPlaybook, getPlaybookMeta } = require("../services/playbookService");
const Guidebook = require("../models/Guidebook");

const MONGO_URI =
    process.env.MONGODB_URI
    || "mongodb://admin:Parmarketing%404545%23@localhost:27017/social_dashboard?authSource=admin";

async function main() {
    const force = process.argv.includes("--force");

    console.log(`\n📖 Guidebook setup (${force ? "FORCE reset" : "ensure defaults"})\n`);

    await mongoose.connect(MONGO_URI);
    console.log("MongoDB connected\n");

    await seedDefaultGuidebook({ force });
    await seedGlobalPlaybook({ force });

    const categories = await Guidebook.find({ pageId: null }).sort({ sortOrder: 1 }).lean();
    const meta = await getPlaybookMeta(null);

    console.log("\n── Global guidebook categories ──");
    for (const c of categories) {
        console.log(`  ${c.sortOrder}. ${c.label} (${c.category}) — ${c.triggers?.length || 0} triggers`);
    }

    console.log("\n── Global playbook ──");
    console.log(`  CTA: ${meta.playbook.replyCta}`);
    console.log(`  Urgent CTA: ${meta.playbook.replyCtaUrgent}`);
    console.log(`  Lead triggers: ${(meta.playbook.leadInquiryTriggers || []).join(", ") || "(none)"}`);

    console.log(`\n✅ Done — ${categories.length} categories ready for all accounts.\n`);

    await mongoose.disconnect();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
