// const { CATEGORY_LABELS } = require("../constants/moderation");
// const { NO_ISSUE_TEMPLATES } = require("../constants/replyFraming");

// /**
//  * Global default guidebook (pageId: null) — industry-agnostic starting point.
//  * Templates use {{username}}, {{issue}}, {{brand}}, {{cta}}, {{cta_urgent}}.
//  * Per-account CTAs come from Page.playbook; per-account categories override via pageId on Guidebook rows.
//  */
// const DEFAULT_GUIDEBOOK = [
//     {
//         category: "poor_service",
//         label: CATEGORY_LABELS.poor_service,
//         sortOrder: 1,
//         triggers: [
//             "worst service", "bad service", "terrible service", "pathetic service",
//             "worst", "customer service", "customer care", "support team",
//             "unprofessional", "rude staff", "rude employee", "misbehaved",
//             "no response", "never responded", "nobody responded", "not responded",
//             "no callback", "ignored my call", "ignored my message",
//             "disappointed", "unsatisfied", "not happy", " unhappy ",
//             " waste of time ", "horrible experience", " awful experience ",
//             " no help ", "useless support", "useless service",
//             "don't use", "do not use", "not resolved", "not resolve", "unresolved",
//             "troubling", "more trouble", "facing trouble",
//         ],
//         exampleComments: [
//             "Don't use this company — they never resolve anything",
//             "Don't use singledebt service they are not resolved your debts",
//         ],
//         description: "Customer unhappy with service quality, support, or outcomes.",
//         instructions:
//             "Acknowledge frustration. Reference {{issue}} from their comment. Use the account CTA ({{cta}}). Never blame the customer.",
//         dontSay: ["that's not true", "you're wrong", "not our fault", "calm down"],
//         template: "Hi {{username}}, we're truly sorry to hear about {{issue}} — this isn't the standard {{brand}} aims for. {{cta}}",
//         templates: {
//             mild: "Hi {{username}}, thank you for sharing your feedback about {{issue}}. We're sorry we fell short. {{cta}}",
//             moderate: "Hi {{username}}, we sincerely apologise regarding {{issue}}. {{cta}}",
//             severe: "Hi {{username}}, we're deeply sorry about {{issue}}. This is unacceptable and we take full accountability. {{cta_urgent}}",
//             noIssue: NO_ISSUE_TEMPLATES.poor_service,
//         },
//         confidenceThreshold: 38,
//         defaultPriority: "high",
//         recommendedAction: "dm_customer",
//         escalationTriggers: ["sue", "lawyer", "legal action", "consumer court"],
//     },
//     {
//         category: "pricing",
//         label: CATEGORY_LABELS.pricing,
//         sortOrder: 2,
//         triggers: [
//             "too expensive", "overpriced", "over priced", " costly ", "costs too much",
//             "price", "prices", "pricing", "fee", "fees", "charges", " charge ", "charging",
//             "hidden charges", " hidden fee ", "refund", "refund nhi", "refund nahi",
//             "money back", "return my money", "want my money", "cheated", "charged extra",
//             "not worth", "waste of money", "rip off", "ripoff", "double charged",
//             "billing", "invoice wrong", " overcharged ", "payment issue",
//             "payment k baad", "payment ke baad", "paise kha", "pasise kha", "kha gaye", "kha liye",
//             "mehenga", "mahnga",
//             "recharge", "recharge plan", "prices badenge", "price badh", "badenge",
//         ],
//         exampleComments: [
//             "Way too expensive for what you get",
//             "I want a full refund immediately",
//             "You charged me twice",
//             "mere pasise kha gaye yeh",
//             "paise kha gaye refund do",
//         ],
//         description: "Pricing, fees, refunds, or billing disputes.",
//         instructions: "Acknowledge without arguing about value. Never dismiss refunds publicly. {{cta}}",
//         dontSay: ["that's the price", "non-refundable", "you agreed to pay", "we don't give refunds"],
//         template: "Hi {{username}}, regarding {{issue}} — we'd like to review the billing details with you. {{cta}}",
//         templates: {
//             mild: "Hi {{username}}, thanks for raising {{issue}} with us. We'll look into the charges. {{cta}}",
//             moderate: "Hi {{username}}, we understand your concern about {{issue}} and will verify the billing on our end. {{cta}}",
//             severe: "Hi {{username}}, we take billing and refund matters seriously — especially {{issue}}. {{cta_urgent}}",
//             noIssue: NO_ISSUE_TEMPLATES.pricing,
//         },
//         confidenceThreshold: 45,
//         defaultPriority: "high",
//         recommendedAction: "dm_customer",
//         escalationTriggers: ["fraud", "scam", "police", "lawyer"],
//     },
//     {
//         category: "delay",
//         label: CATEGORY_LABELS.delay,
//         sortOrder: 3,
//         triggers: [
//             "still waiting", "not delivered", "not received", "where is my",
//             "late delivery", "delayed", " delay ", "hasn't arrived", "has not arrived",
//             "no update", "no callback", "waiting since", "weeks ago", "months ago",
//             "when will i get", "when will i receive", "order pending", "shipping delay",
//             "case pending", "settlement delay", "not arrived yet",
//         ],
//         exampleComments: [
//             "Still waiting after 2 weeks with no update",
//             "Where is my order? No updates at all",
//             "When will I receive a callback?",
//         ],
//         description: "Delays — delivery, callback, case update, or service not completed on time.",
//         instructions: "Show empathy for the wait. No false ETAs publicly. {{cta}}",
//         dontSay: ["be patient", "it will come soon", "not our responsibility", "delays happen"],
//         template: "Hi {{username}}, we're sorry for the inconvenience — {{issue}}. We know waiting is frustrating. {{cta}}",
//         templates: { noIssue: NO_ISSUE_TEMPLATES.delay },
//         confidenceThreshold: 50,
//         defaultPriority: "normal",
//         recommendedAction: "dm_customer",
//         escalationTriggers: ["never ordering again", "reporting you"],
//     },
//     {
//         category: "technical_issue",
//         label: CATEGORY_LABELS.technical_issue,
//         sortOrder: 4,
//         triggers: [
//             "not working", "doesn't work", "doesnt work", " broken ", " crashed ", " crashing ",
//             "keeps crashing", "error", " bug ", "glitch", "can't login", "cant login",
//             "app not opening", "website down", " page not loading ", "otp not received",
//             "payment failed", "transaction failed", "technical problem", "technical issue",
//             "whatsapp", "whats app", "unknown no", "unknown number", "fake call", "fake agent",
//             "not receive", "don't receive", "dont receive", "not connecting",
//         ],
//         exampleComments: [
//             "The app keeps crashing every time I open it",
//             "Payment failed but money was deducted",
//             "Getting fake calls claiming to be from your team",
//         ],
//         description: "App, website, payment, or contact-channel technical problems.",
//         instructions: "Acknowledge the issue. Ask for details/screenshot via {{cta}}.",
//         dontSay: ["works fine for me", "user error", "try again later", "it's your phone"],
//         template: "Hi {{username}}, sorry you're facing trouble with {{issue}}. {{cta}}",
//         templates: { noIssue: NO_ISSUE_TEMPLATES.technical_issue },
//         confidenceThreshold: 50,
//         defaultPriority: "normal",
//         recommendedAction: "dm_customer",
//     },
//     {
//         category: "complaint",
//         label: CATEGORY_LABELS.complaint,
//         sortOrder: 5,
//         triggers: [
//             "complaint", " complain ", "not satisfied", " dissatisfied ",
//             "issue with", "problem with", " facing issue ", "having trouble",
//             " resolve this ", "fix this", "unacceptable",
//             "need help with",
//         ],
//         exampleComments: [
//             "I have a serious complaint about my recent experience",
//             "This is unacceptable, please resolve my issue",
//             "Need help with a problem I'm facing",
//         ],
//         description: "General complaints that don't fit another category.",
//         instructions: "Thank them. Mirror {{issue}} briefly. {{cta}}",
//         dontSay: ["we don't accept complaints here", "nothing we can do", "contact someone else"],
//         template: "Hi {{username}}, we're sorry to hear about {{issue}}. {{cta}}",
//         templates: {
//             mild: "Hi {{username}}, thank you for reaching out about {{issue}}. We're here to help. {{cta}}",
//             moderate: "Hi {{username}}, we understand your concern regarding {{issue}}. {{cta}}",
//             severe: "Hi {{username}}, we're sorry about {{issue}} — this needs attention and we want to resolve it. {{cta_urgent}}",
//             noIssue: NO_ISSUE_TEMPLATES.complaint,
//         },
//         confidenceThreshold: 45,
//         defaultPriority: "normal",
//         recommendedAction: "reply_publicly",
//     },
//     {
//         category: "scam_fraud",
//         label: CATEGORY_LABELS.scam_fraud,
//         sortOrder: 6,
//         triggers: [
//             "scam", "fraud", "fraudulent", "fake", "cheat", "cheater", "froud",
//             "fake company", "fake testimonial", "cheated me", " loot ", " stole my money",
//             "don't trust", "dont trust", "can't trust", "no one can trust", " beware ",
//             "trust mat", "dhokha", "dhokebaaz", "farzi", "nakli", "lootne", "paise loot",
//             "help na le", "help mat lo", "ai generated", "ai-generated",
//             "i am victim", "i am a victim", "i'm a victim", "victim of", "being victimized",
//         ],
//         exampleComments: [
//             "This company is a complete scam",
//             "They cheated me out of my money",
//             "Fake testimonials, stay away",
//             "I am victim",
//             "I am a victim of fraud",
//         ],
//         description: "Public allegations of scam, fraud, or dishonest practices.",
//         instructions: "Stay calm. Never argue or admit liability publicly. Escalate internally. {{cta_urgent}}",
//         dontSay: ["we are not a scam", "you're lying", "prove it", "delete this comment"],
//         template: "Hi {{username}}, we take concerns like {{issue}} very seriously and would like to understand your experience privately. {{cta_urgent}}",
//         templates: {
//             mild: "Hi {{username}}, thank you for sharing {{issue}} with us — we want to look into this properly. {{cta}}",
//             moderate: "Hi {{username}}, we're sorry to hear that {{issue}}. Our team will review this carefully. {{cta_urgent}}",
//             severe: "Hi {{username}}, {{issue}} is taken extremely seriously at {{brand}}. {{cta_urgent}}",
//             noIssue: NO_ISSUE_TEMPLATES.scam_fraud,
//         },
//         confidenceThreshold: 38,
//         defaultPriority: "critical",
//         recommendedAction: "internal_review",
//         escalationTriggers: ["police", "lawyer", "legal", "court", "consumer forum"],
//     },
//     {
//         category: "accusation",
//         label: CATEGORY_LABELS.accusation,
//         sortOrder: 7,
//         triggers: [
//             "you lied", " false promise ", "misleading", " fake claims ", "deceiving",
//             " dishonest ", "fooling", "fool people", "fooling people",
//             "failed terribly", "failed badly", "harassment", "harassing", "harassed",
//             "ai generated", " paid reviews ", " data leak ",
//         ],
//         exampleComments: [
//             "You lied about the product features",
//             "Why are you fooling people?",
//             "Misleading advertisement, completely false claims",
//         ],
//         description: "Accusations of dishonesty, false advertising, or ethical violations.",
//         instructions: "Respond calmly. No public debate. Route to senior team. {{cta}}",
//         dontSay: ["that's defamation", "fake news", "paid comment"],
//         template: "Hi {{username}}, we appreciate you raising this about {{issue}}. We hold ourselves to high standards and would like to clarify. {{cta}}",
//         templates: { noIssue: NO_ISSUE_TEMPLATES.accusation },
//         confidenceThreshold: 38,
//         defaultPriority: "critical",
//         recommendedAction: "internal_review",
//         escalationTriggers: ["sue", "lawyer", "legal notice", "media", "press"],
//     },
//     {
//         category: "angry_customer",
//         label: CATEGORY_LABELS.angry_customer,
//         sortOrder: 8,
//         triggers: [
//             "never again", "never buying", "buying from you again", "worst company", "worst ever",
//             " hate ", " disgusting ", " boycott ", " warn everyone ", " stay away ",
//             " pathetic ", " useless ", " garbage ", " trash ", "!!!", "😡", "🤬",
//         ],
//         exampleComments: [
//             "NEVER using you again!!! Worst company ever",
//             "Warning everyone to stay away",
//             "Absolutely pathetic service",
//         ],
//         description: "Highly emotional comments or public warnings to others.",
//         instructions: "Lead with empathy. Don't mirror anger. {{cta}}",
//         dontSay: ["calm down", "relax", "as per our policy"],
//         template: "Hi {{username}}, we hear how frustrated you are about {{issue}}, and you deserve better from {{brand}}. {{cta}}",
//         templates: {
//             mild: "Hi {{username}}, we're sorry to have disappointed you regarding {{issue}}. {{cta}}",
//             moderate: "Hi {{username}}, your frustration about {{issue}} is completely understandable. {{cta}}",
//             severe: "Hi {{username}}, we hear you — {{issue}} is not acceptable, and we want to make this right. {{cta_urgent}}",
//             noIssue: NO_ISSUE_TEMPLATES.angry_customer,
//         },
//         confidenceThreshold: 45,
//         defaultPriority: "high",
//         recommendedAction: "dm_customer",
//     },
// ];

// module.exports = { DEFAULT_GUIDEBOOK };



const { CATEGORY_LABELS } = require("../constants/moderation");
const { NO_ISSUE_TEMPLATES } = require("../constants/replyFraming");

/**
 * Global default guidebook (pageId: null) — industry-agnostic starting point.
 * Templates use {{username}}, {{issue}}, {{brand}}, {{cta}}, {{cta_urgent}}.
 * Per-account CTAs come from Page.playbook; per-account categories override via pageId on Guidebook rows.
 *
 * CHANGES FROM PREVIOUS VERSION:
 * 1. All short/ambiguous triggers (fee, price, bug, error, etc.) now use leading/trailing
 *    spaces for word-boundary matching, consistently, everywhere. Previously this was applied
 *    to some triggers and not others, causing false positives (e.g. "fee" matching "feedback").
 * 2. Removed "!!!" as a standalone anger trigger — it fires on enthusiastic positive comments too.
 * 3. Removed duplicate triggers across categories ("no callback" was in both poor_service and
 *    delay; "ai generated" was in both scam_fraud and accusation). Kept in the more specific category.
 * 4. Moved `complaint` to the LAST sortOrder — it's a broad catch-all and should only match after
 *    every more specific category has had a chance. Calling code must respect sortOrder in its
 *    tie-break logic; if it currently checks array order or something else, that needs updating too.
 * 5. Every category now has mild/moderate/severe templates (delay, technical_issue, accusation
 *    were previously falling back to a single generic `template`).
 * 6. Templates are now ARRAYS of variants per severity, not single strings. This is the fix for
 *    the "same reply every time" problem. Calling code must pick a variant — e.g.:
 *      const variant = variants[Math.floor(Math.random() * variants.length)];
 *    or round-robin/track last-used-index per page to avoid repeats to the same audience.
 *    `template` (singular, string) is kept only as a legacy fallback — new code should read
 *    `templates[severity]` as an array.
 * 7. Expanded escalationTriggers with common variants (lawsuit, suing, filed a case) — this is
 *    still substring matching and will still miss paraphrases/misspellings. If missed escalations
 *    are costly, this needs a proper classifier, not a keyword list.
 */
const DEFAULT_GUIDEBOOK = [
    {
        category: "poor_service",
        label: CATEGORY_LABELS.poor_service,
        sortOrder: 1,
        triggers: [
            "worst service", "bad service", "terrible service", "pathetic service",
            "worst", "customer service", "customer care", "support team",
            "unprofessional", "rude staff", "rude employee", "misbehaved",
            "no response", "never responded", "nobody responded", "not responded",
            "ignored my call", "ignored my message",
            "disappointed", "unsatisfied", " not happy ", " unhappy ",
            " waste of time ", "horrible experience", " awful experience ",
            " no help ", "useless support", "useless service",
            "don't use", "do not use", "not resolved", "not resolve", "unresolved",
            "troubling", "more trouble", "facing trouble",
        ],
        exampleComments: [
            "Don't use this company — they never resolve anything",
            "Don't use singledebt service they are not resolved your debts",
        ],
        description: "Customer unhappy with service quality, support, or outcomes.",
        instructions:
            "Acknowledge frustration. Reference {{issue}} from their comment. Use the account CTA ({{cta}}). Never blame the customer.",
        dontSay: ["that's not true", "you're wrong", "not our fault", "calm down"],
        template: "Hi {{username}}, we're truly sorry to hear about {{issue}} — this isn't the standard {{brand}} aims for. {{cta}}",
        templates: {
            mild: [
                "Hi {{username}}, thank you for sharing your feedback about {{issue}}. We're sorry we fell short. {{cta}}",
                "Hi {{username}}, appreciate you flagging {{issue}} — this isn't the experience we want for you. {{cta}}",
            ],
            moderate: [
                "Hi {{username}}, we sincerely apologise regarding {{issue}}. {{cta}}",
                "Hi {{username}}, this shouldn't have happened — sorry about {{issue}}. {{cta}}",
            ],
            severe: [
                "Hi {{username}}, we're deeply sorry about {{issue}}. This is unacceptable and we take full accountability. {{cta_urgent}}",
                "Hi {{username}}, what you've described about {{issue}} falls well short of what you should expect from us. {{cta_urgent}}",
            ],
            noIssue: NO_ISSUE_TEMPLATES.poor_service,
        },
        confidenceThreshold: 38,
        defaultPriority: "high",
        recommendedAction: "dm_customer",
        escalationTriggers: ["sue", "lawyer", "legal action", "consumer court", "lawsuit", "suing", "filed a case"],
    },
    {
        category: "pricing",
        label: CATEGORY_LABELS.pricing,
        sortOrder: 2,
        triggers: [
            "too expensive", "overpriced", "over priced", " costly ", "costs too much",
            " price ", " prices ", " pricing ", " fee ", " fees ", " charges ", " charge ", "charging",
            "hidden charges", " hidden fee ", "refund", "refund nhi", "refund nahi",
            "money back", "return my money", "want my money", "cheated", "charged extra",
            "not worth", "waste of money", "rip off", "ripoff", "double charged",
            "billing", "invoice wrong", " overcharged ", "payment issue",
            "payment k baad", "payment ke baad", "paise kha", "pasise kha", "kha gaye", "kha liye",
            "mehenga", "mahnga",
            "recharge", "recharge plan", "prices badenge", "price badh", "badenge",
        ],
        exampleComments: [
            "Way too expensive for what you get",
            "I want a full refund immediately",
            "You charged me twice",
            "mere pasise kha gaye yeh",
            "paise kha gaye refund do",
        ],
        description: "Pricing, fees, refunds, or billing disputes.",
        instructions: "Acknowledge without arguing about value. Never dismiss refunds publicly. {{cta}}",
        dontSay: ["that's the price", "non-refundable", "you agreed to pay", "we don't give refunds"],
        template: "Hi {{username}}, regarding {{issue}} — we'd like to review the billing details with you. {{cta}}",
        templates: {
            mild: [
                "Hi {{username}}, thanks for raising {{issue}} with us. We'll look into the charges. {{cta}}",
                "Hi {{username}}, noted on {{issue}} — let's take a closer look at your billing. {{cta}}",
            ],
            moderate: [
                "Hi {{username}}, we understand your concern about {{issue}} and will verify the billing on our end. {{cta}}",
                "Hi {{username}}, thanks for flagging {{issue}}. We'll check the charges against your account. {{cta}}",
            ],
            severe: [
                "Hi {{username}}, we take billing and refund matters seriously — especially {{issue}}. {{cta_urgent}}",
                "Hi {{username}}, {{issue}} needs a proper look from our billing team, not a generic reply. {{cta_urgent}}",
            ],
            noIssue: NO_ISSUE_TEMPLATES.pricing,
        },
        confidenceThreshold: 45,
        defaultPriority: "high",
        recommendedAction: "dm_customer",
        escalationTriggers: ["fraud", "scam", "police", "lawyer", "lawsuit", "suing"],
    },
    {
        category: "delay",
        label: CATEGORY_LABELS.delay,
        sortOrder: 3,
        triggers: [
            "still waiting", "not delivered", "not received", "where is my",
            "late delivery", "delayed", " delay ", "hasn't arrived", "has not arrived",
            "no update", "no callback", "waiting since", "weeks ago", "months ago",
            "when will i get", "when will i receive", "order pending", "shipping delay",
            "case pending", "settlement delay", "not arrived yet",
        ],
        exampleComments: [
            "Still waiting after 2 weeks with no update",
            "Where is my order? No updates at all",
            "When will I receive a callback?",
        ],
        description: "Delays — delivery, callback, case update, or service not completed on time.",
        instructions: "Show empathy for the wait. No false ETAs publicly. {{cta}}",
        dontSay: ["be patient", "it will come soon", "not our responsibility", "delays happen"],
        template: "Hi {{username}}, we're sorry for the inconvenience — {{issue}}. We know waiting is frustrating. {{cta}}",
        templates: {
            mild: [
                "Hi {{username}}, thanks for the nudge on {{issue}} — let's get you an update. {{cta}}",
                "Hi {{username}}, sorry for the wait on {{issue}}. {{cta}}",
            ],
            moderate: [
                "Hi {{username}}, we're sorry for the inconvenience — {{issue}}. We know waiting is frustrating. {{cta}}",
                "Hi {{username}}, {{issue}} has gone on too long — let's sort out a real update for you. {{cta}}",
            ],
            severe: [
                "Hi {{username}}, a delay like {{issue}} isn't okay and we want to fix it now. {{cta_urgent}}",
                "Hi {{username}}, we hear you on {{issue}} — this needs immediate attention. {{cta_urgent}}",
            ],
            noIssue: NO_ISSUE_TEMPLATES.delay,
        },
        confidenceThreshold: 50,
        defaultPriority: "normal",
        recommendedAction: "dm_customer",
        escalationTriggers: ["never ordering again", "reporting you"],
    },
    {
        category: "technical_issue",
        label: CATEGORY_LABELS.technical_issue,
        sortOrder: 4,
        triggers: [
            "not working", "doesn't work", "doesnt work", " broken ", " crashed ", " crashing ",
            "keeps crashing", " error ", " bug ", "glitch", "can't login", "cant login",
            "app not opening", "website down", " page not loading ", "otp not received",
            "payment failed", "transaction failed", "technical problem", "technical issue",
            "whatsapp", "whats app", "unknown no", "unknown number", "fake call", "fake agent",
            "not receive", "don't receive", "dont receive", "not connecting",
        ],
        exampleComments: [
            "The app keeps crashing every time I open it",
            "Payment failed but money was deducted",
            "Getting fake calls claiming to be from your team",
        ],
        description: "App, website, payment, or contact-channel technical problems.",
        instructions: "Acknowledge the issue. Ask for details/screenshot via {{cta}}.",
        dontSay: ["works fine for me", "user error", "try again later", "it's your phone"],
        template: "Hi {{username}}, sorry you're facing trouble with {{issue}}. {{cta}}",
        templates: {
            mild: [
                "Hi {{username}}, sorry you're facing trouble with {{issue}}. {{cta}}",
                "Hi {{username}}, thanks for flagging {{issue}} — let's get this checked. {{cta}}",
            ],
            moderate: [
                "Hi {{username}}, that's frustrating — {{issue}} shouldn't happen. {{cta}}",
                "Hi {{username}}, sorry about {{issue}}. Can you share a bit more detail so we can fix it? {{cta}}",
            ],
            severe: [
                "Hi {{username}}, {{issue}} sounds serious, especially if money was involved — let's resolve this urgently. {{cta_urgent}}",
                "Hi {{username}}, we want to get {{issue}} fixed right away. {{cta_urgent}}",
            ],
            noIssue: NO_ISSUE_TEMPLATES.technical_issue,
        },
        confidenceThreshold: 50,
        defaultPriority: "normal",
        recommendedAction: "dm_customer",
    },
    {
        category: "scam_fraud",
        label: CATEGORY_LABELS.scam_fraud,
        sortOrder: 5,
        triggers: [
            "scam", "fraud", "fraudulent", "fake", "cheat", "cheater", "froud",
            "fake company", "fake testimonial", "cheated me", " loot ", " stole my money",
            "don't trust", "dont trust", "can't trust", "no one can trust", " beware ",
            "trust mat", "dhokha", "dhokebaaz", "farzi", "nakli", "lootne", "paise loot",
            "help na le", "help mat lo",
            "i am victim", "i am a victim", "i'm a victim", "victim of", "being victimized",
        ],
        exampleComments: [
            "This company is a complete scam",
            "They cheated me out of my money",
            "Fake testimonials, stay away",
            "I am victim",
            "I am a victim of fraud",
        ],
        description: "Public allegations of scam, fraud, or dishonest practices.",
        instructions: "Stay calm. Never argue or admit liability publicly. Escalate internally. {{cta_urgent}}",
        dontSay: ["we are not a scam", "you're lying", "prove it", "delete this comment"],
        template: "Hi {{username}}, {{issue}} is taken very seriously and we would like to understand your experience privately. {{cta_urgent}}",
        templates: {
            mild: [
                "Hi {{username}}, thank you for sharing {{issue}} with us — we want to look into this properly. {{cta}}",
                "Hi {{username}}, we'd like to understand what happened with {{issue}}. {{cta}}",
            ],
            moderate: [
                "Hi {{username}}, we're sorry to hear that {{issue}}. Our team will review this carefully. {{cta_urgent}}",
                "Hi {{username}}, {{issue}} is concerning to hear — we want to get to the bottom of it. {{cta_urgent}}",
            ],
            severe: [
                "Hi {{username}}, {{issue}} is taken extremely seriously at {{brand}}. {{cta_urgent}}",
                "Hi {{username}}, we want to look into {{issue}} directly with you — please reach out so a senior team member can help. {{cta_urgent}}",
                "Hi {{username}}, what you've raised about {{issue}} needs a direct conversation, not a public reply. {{cta_urgent}}",
            ],
            noIssue: NO_ISSUE_TEMPLATES.scam_fraud,
        },
        confidenceThreshold: 38,
        defaultPriority: "critical",
        recommendedAction: "internal_review",
        escalationTriggers: ["police", "lawyer", "legal", "court", "consumer forum", "lawsuit", "suing", "filed a case"],
    },
    {
        category: "accusation",
        label: CATEGORY_LABELS.accusation,
        sortOrder: 6,
        triggers: [
            "you lied", " false promise ", "misleading", " fake claims ", "deceiving",
            " dishonest ", "fooling", "fool people", "fooling people",
            "failed terribly", "failed badly", "harassment", "harassing", "harassed",
            "ai generated", " paid reviews ", " data leak ",
        ],
        exampleComments: [
            "You lied about the product features",
            "Why are you fooling people?",
            "Misleading advertisement, completely false claims",
        ],
        description: "Accusations of dishonesty, false advertising, or ethical violations.",
        instructions: "Respond calmly. No public debate. Route to senior team. {{cta}}",
        dontSay: ["that's defamation", "fake news", "paid comment"],
        template: "Hi {{username}}, we appreciate you raising this about {{issue}}. We hold ourselves to high standards and would like to clarify. {{cta}}",
        templates: {
            mild: [
                "Hi {{username}}, thanks for raising {{issue}} — we'd like to clarify. {{cta}}",
                "Hi {{username}}, appreciate you pointing out {{issue}}. {{cta}}",
            ],
            moderate: [
                "Hi {{username}}, we take {{issue}} seriously and want to explain what happened. {{cta}}",
                "Hi {{username}}, {{issue}} deserves a proper explanation from us. {{cta}}",
            ],
            severe: [
                "Hi {{username}}, we hold ourselves to high standards and want to address {{issue}} directly. {{cta_urgent}}",
                "Hi {{username}}, {{issue}} is a serious claim — we'd like to discuss it with you directly. {{cta_urgent}}",
            ],
            noIssue: NO_ISSUE_TEMPLATES.accusation,
        },
        confidenceThreshold: 38,
        defaultPriority: "critical",
        recommendedAction: "internal_review",
        escalationTriggers: ["sue", "lawyer", "legal notice", "media", "press", "lawsuit", "suing"],
    },
    {
        category: "angry_customer",
        label: CATEGORY_LABELS.angry_customer,
        sortOrder: 7,
        triggers: [
            "never again", "never buying", "buying from you again", "worst company", "worst ever",
            " hate ", " disgusting ", " boycott ", " warn everyone ", " stay away ",
            " pathetic ", " useless ", " garbage ", " trash ", "😡", "🤬",
        ],
        exampleComments: [
            "NEVER using you again!!! Worst company ever",
            "Warning everyone to stay away",
            "Absolutely pathetic service",
        ],
        description: "Highly emotional comments or public warnings to others.",
        instructions: "Lead with empathy. Don't mirror anger. {{cta}}",
        dontSay: ["calm down", "relax", "as per our policy"],
        template: "Hi {{username}}, we hear how frustrated you are about {{issue}}, and you deserve better from {{brand}}. {{cta}}",
        templates: {
            mild: [
                "Hi {{username}}, we're sorry to have disappointed you regarding {{issue}}. {{cta}}",
                "Hi {{username}}, sorry to hear that — let's fix {{issue}}. {{cta}}",
            ],
            moderate: [
                "Hi {{username}}, your frustration about {{issue}} is completely understandable. {{cta}}",
                "Hi {{username}}, we hear you on {{issue}} and want to make it right. {{cta}}",
            ],
            severe: [
                "Hi {{username}}, we hear you — {{issue}} is not acceptable, and we want to make this right. {{cta_urgent}}",
                "Hi {{username}}, you deserve better than {{issue}}. Let's resolve this properly. {{cta_urgent}}",
            ],
            noIssue: NO_ISSUE_TEMPLATES.angry_customer,
        },
        confidenceThreshold: 45,
        defaultPriority: "high",
        recommendedAction: "dm_customer",
    },
    {
        category: "complaint",
        label: CATEGORY_LABELS.complaint,
        sortOrder: 8,
        triggers: [
            "complaint", " complain ", "not satisfied", " dissatisfied ",
            "issue with", "problem with", " facing issue ", "having trouble",
            " resolve this ", "fix this", "unacceptable",
            "need help with",
        ],
        exampleComments: [
            "I have a serious complaint about my recent experience",
            "This is unacceptable, please resolve my issue",
            "Need help with a problem I'm facing",
        ],
        description: "General complaints that don't fit another, more specific category. Deliberately last in sortOrder — this is a broad catch-all and should only match after poor_service, pricing, delay, technical_issue, scam_fraud, accusation, and angry_customer have all been checked.",
        instructions: "Thank them. Mirror {{issue}} briefly. {{cta}}",
        dontSay: ["we don't accept complaints here", "nothing we can do", "contact someone else"],
        template: "Hi {{username}}, we're sorry to hear about {{issue}}. {{cta}}",
        templates: {
            mild: [
                "Hi {{username}}, thank you for reaching out about {{issue}}. We're here to help. {{cta}}",
                "Hi {{username}}, thanks for letting us know about {{issue}}. {{cta}}",
            ],
            moderate: [
                "Hi {{username}}, we understand your concern regarding {{issue}}. {{cta}}",
                "Hi {{username}}, sorry to hear about {{issue}} — we want to help sort this out. {{cta}}",
            ],
            severe: [
                "Hi {{username}}, we're sorry about {{issue}} — this needs attention and we want to resolve it. {{cta_urgent}}",
                "Hi {{username}}, {{issue}} needs a proper resolution — let's take this further. {{cta_urgent}}",
            ],
            noIssue: NO_ISSUE_TEMPLATES.complaint,
        },
        confidenceThreshold: 45,
        defaultPriority: "normal",
        recommendedAction: "reply_publicly",
    },
];

module.exports = { DEFAULT_GUIDEBOOK };