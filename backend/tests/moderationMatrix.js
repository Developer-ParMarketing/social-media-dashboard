/**
 * Comprehensive moderation matrix — run: node backend/tests/moderationMatrix.js
 */
const path = require("path");
const { analyzeCommentText } = require("../services/commentProcessor");
const { DEFAULT_GUIDEBOOK } = require("../data/defaultGuidebook");
const { DEFAULT_PLAYBOOK } = require("../data/defaultPlaybook");

let pageReplyNeedsReview;
async function loadFrontendHelpers() {
    const mod = await import(path.join(__dirname, "../../lib/commentModeration.js"));
    pageReplyNeedsReview = mod.pageReplyNeedsReview;
}

// Fintech-style account playbook used in tests (loan leads)
const TEST_PLAYBOOK = {
    ...DEFAULT_PLAYBOOK,
    leadInquiryTriggers: ["loan", "personal loan"],
};

const guidebooks = DEFAULT_GUIDEBOOK.map((g, i) => ({ ...g, _id: `gb-${i}`, isActive: true }));

function runAnalysis(text, opts = {}) {
    return analyzeCommentText(text, guidebooks, {
        brandName: "Acme Corp",
        playbook: TEST_PLAYBOOK,
        ...opts,
    });
}

function assertCase(name, actual, expected) {
    const failures = [];

    if (expected.sentiment && actual.analysis.sentiment !== expected.sentiment) {
        failures.push(`sentiment: got "${actual.analysis.sentiment}", want "${expected.sentiment}"`);
    }
    if (expected.category !== undefined) {
        const cat = actual.analysis.matchedCategory;
        if (Array.isArray(expected.category)) {
            if (!expected.category.includes(cat)) {
                failures.push(`category: got "${cat}", want one of [${expected.category.join(", ")}]`);
            }
        } else if (cat !== expected.category) {
            failures.push(`category: got "${cat}", want "${expected.category}"`);
        }
    }
    if (expected.categoriesInclude?.length) {
        const matched = actual.analysis.matchedCategories || [];
        for (const c of expected.categoriesInclude) {
            if (!matched.includes(c)) failures.push(`missing category tag: ${c}`);
        }
    }
    if (expected.hasReply === true && !actual.reply.suggestedReply) {
        failures.push("expected suggested reply, got none");
    }
    if (expected.hasReply === false && actual.reply.suggestedReply) {
        failures.push("expected no suggested reply");
    }
    if (expected.replyContains && actual.reply.suggestedReply) {
        for (const snippet of expected.replyContains) {
            if (!actual.reply.suggestedReply.toLowerCase().includes(snippet.toLowerCase())) {
                failures.push(`reply missing "${snippet}"`);
            }
        }
    }
    if (expected.replyNotContains && actual.reply.suggestedReply) {
        for (const snippet of expected.replyNotContains) {
            if (actual.reply.suggestedReply.toLowerCase().includes(snippet.toLowerCase())) {
                failures.push(`reply should not contain "${snippet}"`);
            }
        }
    }
    if (expected.action && actual.analysis.recommendedAction !== expected.action) {
        failures.push(`action: got "${actual.analysis.recommendedAction}", want "${expected.action}"`);
    }
    if (expected.priority && actual.analysis.priority !== expected.priority) {
        failures.push(`priority: got "${actual.analysis.priority}", want "${expected.priority}"`);
    }
    if (expected.maxMatchConfidence != null && (actual.analysis.matchConfidence || 0) > expected.maxMatchConfidence) {
        failures.push(`matchConfidence: got ${actual.analysis.matchConfidence}, max ${expected.maxMatchConfidence}`);
    }
    if (expected.minMatchConfidence != null && (actual.analysis.matchConfidence || 0) < expected.minMatchConfidence) {
        failures.push(`matchConfidence: got ${actual.analysis.matchConfidence}, min ${expected.minMatchConfidence}`);
    }
    if (expected.triggersInclude?.length) {
        const triggers = actual.analysis.matchedTriggers || [];
        for (const t of expected.triggersInclude) {
            if (!triggers.some((hit) => hit.includes(t))) failures.push(`missing trigger containing: ${t}`);
        }
    }

    return { name, ok: failures.length === 0, failures };
}

const ANALYSIS_CASES = [
    // ── Positive ──
    {
        name: "positive: praise",
        text: "Love your product, amazing quality!",
        expect: { sentiment: "positive", category: null, hasReply: false },
    },
    {
        name: "positive: great initiative (no fuzzy cheat false positive)",
        text: "Great initiative by the team, keep it up!",
        expect: { sentiment: "positive", category: null, hasReply: false },
    },
    {
        name: "positive: negated great",
        text: "Not great but okay I guess",
        expect: { sentiment: "neutral", hasReply: false },
    },

    // ── Neutral inquiries ──
    {
        name: "neutral: WhatsApp question",
        text: "Do you have WhatsApp number?",
        expect: { sentiment: "neutral", category: null, hasReply: false },
    },
    {
        name: "neutral: call back request",
        text: "Please call me back tomorrow",
        expect: { sentiment: "neutral", category: null, hasReply: false },
    },
    {
        name: "neutral: contact question",
        text: "What is your contact number?",
        expect: { sentiment: "neutral", category: null, hasReply: false },
    },

    // ── Loan / service leads ──
    {
        name: "lead: I want loan please help",
        text: "I want loan please help",
        expect: { sentiment: "neutral", category: null, hasReply: false },
    },
    {
        name: "lead: please help loan",
        text: "Please help loan",
        expect: { sentiment: "neutral", category: null, hasReply: false },
    },
    {
        name: "lead: need personal loan",
        text: "I need a personal loan",
        expect: { sentiment: "neutral", category: null, hasReply: false },
    },
    {
        name: "lead with complaint signal → negative",
        text: "I want loan but you people are fraud",
        expect: { sentiment: "negative", category: "scam_fraud", hasReply: true },
    },

    // ── CS categories ──
    {
        name: "poor_service: worst service",
        text: "Your customer service is the worst, nobody responded for 3 days",
        expect: { sentiment: "negative", category: "poor_service", hasReply: true },
    },
    {
        name: "pricing: refund",
        text: "Way too expensive, I want a full refund immediately",
        expect: { sentiment: "negative", category: "pricing", hasReply: true },
    },
    {
        name: "pricing: single word charges",
        text: "Charges",
        expect: { sentiment: "negative", category: "pricing", hasReply: true, replyNotContains: ["bringing this to our attention"] },
    },
    {
        name: "pricing: Hinglish recharge",
        text: "Firse recharge plan ke prices badenge 😭",
        expect: { sentiment: "negative", category: "pricing", hasReply: true },
    },
    {
        name: "delay: still waiting",
        text: "Still waiting for my order after 2 weeks, worst service ever!!!",
        expect: { sentiment: "negative", category: ["delay", "poor_service"], hasReply: true },
    },
    {
        name: "technical: app crash + payment",
        text: "App keeps crashing, payment failed but money deducted",
        expect: { sentiment: "negative", category: "technical_issue", hasReply: true },
    },
    {
        name: "technical: WhatsApp unknown number",
        text: "Getting calls from unknown number claiming to be your loan agent",
        expect: { sentiment: "negative", category: "technical_issue", hasReply: true },
    },
    {
        name: "complaint: general",
        text: "I have a serious complaint about my recent order",
        expect: { sentiment: "negative", category: "complaint", hasReply: true },
    },
    {
        name: "scam_fraud: English fraud",
        text: "Fake testimonial, AI generated, no one can trust Singledebt, everything is fraud",
        expect: { sentiment: "negative", category: "scam_fraud", hasReply: true, priority: "critical" },
    },
    {
        name: "scam_fraud: Hinglish loot",
        text: "Koi inse help na le ,, paise lootne ka kam hai ikna",
        expect: { sentiment: "negative", category: "scam_fraud", hasReply: true },
    },
    {
        name: "accusation: fooling people",
        text: "But u failed terribly in my case. Why fooling people?",
        expect: { sentiment: "negative", category: "accusation", hasReply: true, replyNotContains: ["bringing this to our attention"] },
    },
    {
        name: "accusation: you lied",
        text: "You lied about the product features, misleading advertisement",
        expect: { sentiment: "negative", category: "accusation", hasReply: true },
    },
    {
        name: "angry_customer: never again",
        text: "NEVER buying from you again!!! Worst company ever",
        expect: { sentiment: "negative", category: ["angry_customer", "poor_service"], hasReply: true },
    },

    // ── Mixed / edge ──
    {
        name: "mixed: thanks but complaint",
        text: "Thanks for the quick reply but I am still waiting for my refund",
        expect: { sentiment: "negative", category: ["pricing", "delay"], hasReply: true },
    },
    {
        name: "need help with issue → complaint not neutral",
        text: "Need help with a problem I am facing with my account",
        expect: { sentiment: "negative", category: "complaint", hasReply: true },
    },
    {
        name: "complaint-style question → negative not neutral",
        text: "Where is my order? Still waiting!!!",
        expect: { sentiment: "negative", category: ["delay", "complaint"], hasReply: true },
    },
    {
        name: "escalation: lawyer",
        text: "I will contact my lawyer about this scam",
        expect: { sentiment: "negative", category: "scam_fraud", hasReply: true, priority: "critical" },
    },

    // ── Spam ──
    {
        name: "spam: crypto link",
        text: "Follow me for crypto signals https://spam.com",
        expect: { sentiment: "spam", category: null, hasReply: true, action: "hide_comment" },
    },
    {
        name: "spam: buy followers",
        text: "Buy cheap followers DM me for promo",
        expect: { sentiment: "spam", hasReply: true, action: "hide_comment" },
    },
    {
        name: "spam does not override genuine negative",
        text: "This is a scam follow my link https://evil.com",
        expect: { sentiment: "spam", hasReply: true },
    },

    // ── Abuse ──
    {
        name: "abuse: profanity",
        text: "You fucking idiots, worst company ever",
        expect: { sentiment: "abuse", category: "abuse_harassment", hasReply: true, action: "escalate_hr" },
    },
    {
        name: "abuse: harassment",
        text: "Your team is useless pathetic garbage",
        expect: { sentiment: "abuse", category: "abuse_harassment", hasReply: true },
    },
    {
        name: "abuse: threat",
        text: "I will destroy you if you don't refund",
        expect: { sentiment: "abuse", category: "abuse_harassment", hasReply: true, action: "escalate_legal" },
    },

    {
        name: "user case: angelkhushboo loan lead",
        text: "I want loan please help",
        expect: { sentiment: "neutral", category: null, hasReply: false },
    },
    {
        name: "user case: kajal loan lead",
        text: "Please help loan",
        expect: { sentiment: "neutral", category: null, hasReply: false },
    },
    {
        name: "user case: gopiravichandran charges",
        text: "Charges",
        expect: { sentiment: "negative", category: "pricing", hasReply: true, replyNotContains: ["bringing this to our attention"] },
    },
    {
        name: "user case: fooling people accusation",
        text: "But u failed terribly in my case. Why fooling people?",
        expect: { sentiment: "negative", category: "accusation", hasReply: true },
    },

    {
        name: "user case: vick_as_as poor service warning",
        text: "Don't use singledebt service they are not resolved your debts. You will be facing more troubling from the services.",
        expect: {
            sentiment: "negative",
            category: "poor_service",
            hasReply: true,
            replyNotContains: ["bringing this to our attention", "thank you for flagging", "don't use singledebt service they are not resolved"],
            replyContains: ["apolog", "unresolved"],
        },
    },
    {
        name: "example matching: similar to poor_service example",
        text: "Dont use this company they never resolve anything ever",
        expect: { sentiment: "negative", category: "poor_service", hasReply: true },
    },
    {
        name: "issue cap: long comment not pasted verbatim",
        fn: () => {
            const text = "Don't use singledebt service they are not resolved your debts and you will face more troubling from the services and waste your money completely";
            const r = runAnalysis(text);
            const reply = r.reply.suggestedReply || "";
            const failures = [];
            if (reply.includes(text.slice(0, 40).toLowerCase())) {
                failures.push("reply pasted too much of the original comment");
            }
            if (!reply.toLowerCase().includes("unresolved") && !reply.toLowerCase().includes("service")) {
                failures.push("reply should reference service issue summary");
            }
            return { ok: failures.length === 0, failures };
        },
    },
    {
        name: "user case: debt help lead (credit cards overdue)",
        text: "I am stuck in a very bad situation, multiple credit cards and all are over due plus loans on me can you help me out of it ??",
        expect: { sentiment: "neutral", category: null, hasReply: false },
    },
    {
        name: "user case: hinglish call cut",
        text: "Call bhi cut kr dete hai ab",
        expect: {
            sentiment: "negative",
            category: "technical_issue",
            hasReply: true,
            replyNotContains: ["call bhi cut", "regarding call"],
            replyContains: ["disconnect"],
        },
    },
    {
        name: "user case: hinglish money taken and blocked",
        text: "Mera 20000 leke kuch kiya nahi hai or mera number bhi block kar diya hai",
        expect: {
            sentiment: "negative",
            category: "pricing",
            hasReply: true,
            replyNotContains: ["general complaint", "leke kuch", "block kar diya", "regarding general"],
            replyContains: ["payment"],
        },
    },
    {
        name: "user case: hello with distress emoji",
        text: "hello 😢",
        expect: {
            sentiment: "negative",
            category: "angry_customer",
            hasReply: true,
            replyNotContains: ["thank you for flagging", "hello 😢", "going through this"],
            replyContains: ["sorry"],
        },
    },
    {
        name: "user case: hinglish money taken (pasise typo)",
        text: "mere pasise kha gaye yeh",
        expect: {
            sentiment: "negative",
            category: "pricing",
            hasReply: true,
            replyNotContains: ["thank you for flagging", "going through this"],
            replyContains: ["payment"],
        },
    },
    {
        name: "user case: I am victim",
        text: "I am victim",
        expect: {
            sentiment: "negative",
            category: "scam_fraud",
            hasReply: true,
            replyNotContains: ["thank you for flagging", "I am victim"],
            replyContains: ["victimized"],
        },
    },

    {
        name: "universal: reply framing policy across diverse comments",
        fn: () => {
            const { replyViolatesFramingPolicy } = require("../constants/replyFraming");
            const samples = [
                "hello 😢",
                "I am victim",
                "mere pasise kha gaye yeh",
                "Call bhi cut kr dete hai ab",
                "Mera 20000 leke kuch kiya nahi hai or mera number bhi block kar diya hai",
                "I am stuck in a very bad situation, multiple credit cards and all are over due plus loans on me can you help me out of it ??",
                "Don't use singledebt service they are not resolved your debts",
                "Charges",
                "But u failed terribly in my case. Why fooling people?",
                "Your customer service is the worst I've ever seen",
                "Way too expensive, I want a full refund immediately",
                "NEVER buying from you again!!!",
                "This company is a complete scam",
                "Still waiting after 2 weeks with no update",
                "The app keeps crashing every time I open it",
            ];
            const failures = [];
            for (const text of samples) {
                const r = runAnalysis(text);
                const reply = r.reply.suggestedReply;
                if (!reply && r.analysis.sentiment === "negative") {
                    failures.push(`no reply for negative: ${text.slice(0, 40)}`);
                    continue;
                }
                if (!reply) continue;
                const violations = replyViolatesFramingPolicy(reply, text);
                if (violations.length) {
                    failures.push(`${text.slice(0, 35)}… → ${violations.join(", ")}`);
                }
            }
            return { ok: failures.length === 0, failures };
        },
    },

    {
        name: "tailored: each comment gets a unique reply",
        fn: () => {
            const { replyViolatesFramingPolicy } = require("../constants/replyFraming");
            const texts = [
                "Way too expensive, I want a full refund immediately",
                "App keeps crashing every time I open it",
                "But u failed terribly in my case. Why fooling people?",
            ];
            const replies = texts.map((t) => runAnalysis(t).reply.suggestedReply);
            const failures = [];
            if (new Set(replies).size !== 3) failures.push("expected 3 distinct replies, got duplicates");
            texts.forEach((text, i) => {
                const v = replyViolatesFramingPolicy(replies[i], text);
                if (v.length) failures.push(`framing violation in reply ${i + 1}: ${v.join(", ")}`);
            });
            return { ok: failures.length === 0, failures };
        },
    },

    {
        name: "confidence: context-only category match capped at 55",
        text: "I am disappointed with what happened",
        expect: {
            sentiment: "negative",
            maxMatchConfidence: 55,
            triggersInclude: ["context:"],
        },
    },
    {
        name: "confidence: strong trigger scores higher than context",
        text: "I want a full refund immediately, this is unacceptable",
        expect: {
            sentiment: "negative",
            category: "pricing",
            minMatchConfidence: 56,
        },
    },

    // ── Empty ──
    {
        name: "empty text",
        text: "   ",
        expect: { sentiment: "neutral", category: null, hasReply: false },
    },
];

const PAGE_REPLY_CASES = [
    {
        name: "user case: vick team reply with typo youwithin",
        posted: "@vick_as_as please share your contact number along with concern and our team will contact youwithin 48hrs",
        analysis: { sentiment: "negative", matchedCategory: "poor_service" },
        suggested: "Hi vick_as_as, thank you for bringing this to our attention. Please DM us.",
        expectReview: false,
    },
    {
        name: "user case: team lead-capture reply adequate",
        posted: "@angelkhushboo_official_786 please share your contact details and our team will contact you within 48hrs",
        analysis: { sentiment: "negative", matchedCategory: "complaint" },
        suggested: "Hi angelkhushboo_official_786, thank you for bringing this to our attention. Please DM us.",
        expectReview: false,
    },
    {
        name: "user case: kajal team reply adequate",
        posted: "@kajal_shuig please share your contact details and our team will get back to you within 48hrs!",
        analysis: { sentiment: "negative", matchedCategory: "complaint" },
        suggested: "Hi kajal_shuig, thank you for bringing this to our attention. Please DM us.",
        expectReview: false,
    },
    {
        name: "adequate: contact details + 48hrs",
        posted: "@user please share your contact details and our team will contact you within 48hrs",
        analysis: { sentiment: "negative", matchedCategory: "complaint" },
        suggested: "Hi user, thank you for bringing this to our attention. Please DM us.",
        expectReview: false,
    },
    {
        name: "adequate: DM + help",
        posted: "Please DM us with your phone number and we will get back to you within 48 hours.",
        analysis: { sentiment: "negative", matchedCategory: "pricing" },
        suggested: "Hi user, we understand your billing concern. Please DM us.",
        expectReview: false,
    },
    {
        name: "adequate: kindly DM + contact number + get in touch",
        posted: "Kindly DM us your contact number and concern. Our team will get in touch with you within 48 hours.",
        analysis: { sentiment: "negative", matchedCategory: "scam_fraud" },
        suggested: "Hi user, thank you for flagging this — I am victim. Please DM us.",
        expectReview: false,
    },
    {
        name: "needs review: generic thanks only",
        posted: "Thank you for your comment!",
        analysis: { sentiment: "negative", matchedCategory: "complaint" },
        suggested: "Hi user, please DM us the details.",
        expectReview: true,
    },
    {
        name: "no review for neutral lead",
        posted: "Please share contact details",
        analysis: { sentiment: "neutral", matchedCategory: null },
        suggested: null,
        expectReview: false,
    },
    {
        name: "no review when no team reply yet",
        posted: null,
        analysis: { sentiment: "negative", matchedCategory: "complaint" },
        suggested: "Hi user, please DM us.",
        expectReview: true,
    },
];

async function main() {
    await loadFrontendHelpers();

    let passed = 0;
    let failed = 0;
    const failures = [];

    console.log("\n=== COMMENT ANALYSIS MATRIX ===\n");

    for (const tc of ANALYSIS_CASES) {
        if (typeof tc.fn === "function") {
            const check = { name: tc.name, ...tc.fn() };
            if (check.ok) {
                passed += 1;
                console.log(`✓ ${tc.name}`);
            } else {
                failed += 1;
                failures.push(check);
                console.log(`✗ ${tc.name}`);
                for (const f of check.failures) console.log(`    ${f}`);
            }
            continue;
        }

        const result = runAnalysis(tc.text);
        const check = assertCase(tc.name, result, tc.expect);
        if (check.ok) {
            passed += 1;
            console.log(`✓ ${tc.name}`);
        } else {
            failed += 1;
            failures.push(check);
            console.log(`✗ ${tc.name}`);
            for (const f of check.failures) console.log(`    ${f}`);
        }
    }

    console.log("\n=== PAGE REPLY REVIEW MATRIX ===\n");

    for (const tc of PAGE_REPLY_CASES) {
        const comment = {
            analysis: tc.analysis,
            reply: { suggestedReply: tc.suggested },
            replies: tc.posted ? [{ username: "AcmeCorp", text: tc.posted }] : [],
        };
        const needsReview = pageReplyNeedsReview(comment, ["AcmeCorp"]);
        const ok = needsReview === tc.expectReview;
        if (ok) {
            passed += 1;
            console.log(`✓ ${tc.name}`);
        } else {
            failed += 1;
            failures.push({ name: tc.name, failures: [`needsReview: got ${needsReview}, want ${tc.expectReview}`] });
            console.log(`✗ ${tc.name} — needsReview: got ${needsReview}, want ${tc.expectReview}`);
        }
    }

    console.log(`\n=== SUMMARY: ${passed} passed, ${failed} failed (${passed + failed} total) ===\n`);

    if (failed > 0) {
        process.exit(1);
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
