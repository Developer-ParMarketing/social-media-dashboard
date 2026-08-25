const crypto = require("crypto");
const Sentiment = require("sentiment");
const natural = require("natural");
const Guidebook = require("../models/Guidebook");
const Comment = require("../models/Comment");
const Page = require("../models/Page");
const { DEFAULT_GUIDEBOOK } = require("../data/defaultGuidebook");
const { DEFAULT_PLAYBOOK } = require("../data/defaultPlaybook");
const { loadPlaybook, resolveBrandName } = require("./playbookService");
const { CATEGORY_LABELS } = require("../constants/moderation");
const { isBrandAuthor } = require("../utils/commentHelpers");
const {
    analyzeHinglishSentiment,
    hasFalsePositiveEnglishContext,
} = require("../constants/hinglishNegative");
const { detectFuzzyCriticalWords } = require("../constants/fuzzyCriticalWords");
const { detectAbuse } = require("../constants/abuseDetection");
const { matchGuidebookFromExamples } = require("../constants/exampleMatching");
const { resolveHinglishIssueLabel, isHinglishDominant } = require("../constants/hinglishIssueLabels");
const {
    NO_ISSUE_TEMPLATES,
    isEmbeddableIssue,
    shouldEmbedIssueInReply,
    pickReplyTemplate,
    issueEchoesComment,
} = require("../constants/replyFraming");
const {
    findLearnedApprovedReply,
    isSimilarToRejectedReply,
} = require("./guidebookLearning");

const sentimentAnalyzer = new Sentiment();
const stemmer = natural.PorterStemmer;

/** Max words embedded in {{issue}} — keeps replies human, not copy-pasted */
const MAX_ISSUE_WORDS = 12;
const LONG_COMMENT_CHARS = 40;

/**
 * Single-word triggers that alone are enough to classify (scam/fraud/accusation).
 * Score ~48 so they clear category thresholds (~38) without needing multiple hits.
 */
const STRONG_SIGNAL_WORDS = new Set([
    "fraud", "fraudulent", "scam", "scammer", "fake", "cheat", "cheated", "cheating",
    "loot", "looting", "dhokha", "dhokebaaz", "farzi", "nakli", "chor",
]);

/** Categories that accept a single strong-signal word match */
const HIGH_SIGNAL_CATEGORIES = new Set(["scam_fraud", "accusation"]);

/** Primary category when multiple guidebook categories match — higher rank wins, then confidence */
const CATEGORY_RANK = Object.freeze({
    scam_fraud: 100,
    accusation: 95,
    angry_customer: 85,
    poor_service: 75,
    pricing: 70,
    delay: 65,
    technical_issue: 60,
    complaint: 50,
});

const PRIORITY_RANK = Object.freeze({ normal: 0, high: 1, critical: 2 });

function coreTriggerWord(trigger) {
    return trigger.trim().toLowerCase().replace(/^[^a-z0-9]+|[^a-z0-9]+$/gi, "");
}

/** Points for a matched trigger — strong single words score high enough to pass threshold alone */
function scoreTriggerMatch(trigger, matchType = "literal") {
    const t = trigger.trim().toLowerCase();
    const isPhrase = t.includes(" ");
    if (isPhrase) return 35;

    const core = coreTriggerWord(t);
    if (core && (STRONG_SIGNAL_WORDS.has(core) || STRONG_SIGNAL_STEMS.has(stemWord(core)))) {
        return 48;
    }

    // Stemmed inflection match (disappointing → disappointed) = phrase-level confidence
    if (matchType === "stem") return 35;

    return 22;
}

// ── Global spam patterns (not category-specific) ──
const SPAM_PATTERNS = [
    /\b(?:https?:\/\/|www\.)\S+/i,
    /\bfollow\s+(?:me|back|for)\b/i,
    /\bdm\s+(?:me|for)\s+(?:promo|collab|deal)/i,
    /\b(?:buy|cheap)\s+followers\b/i,
    /\b(?:crypto|forex|bitcoin)\s+(?:signal|tip|profit)/i,
    /\b(?:click|check)\s+(?:link|bio)\b/i,
];

/** 8+ identical chars in a row — checked separately with a genuine-sentiment bypass */
const REPEATED_CHAR_SPAM = /(.)\1{7,}/;

const GENUINE_POSITIVE_WORDS = [
    "love", "loved", "loving", "good", "great", "awesome", "amazing", "excellent",
    "wonderful", "fantastic", "beautiful", "perfect", "best", "happy", "thanks", "thank",
    "helpful", "recommend", "satisfied", "nice", "brilliant", "outstanding",
];

const GENUINE_NEGATIVE_WORDS = [
    "bad", "worst", "terrible", "awful", "hate", "horrible", "disappointed", "disappointing",
    "angry", "frustrated", "useless", "pathetic", "scam", "fraud", "fake", "cheat",
];

/** Sarcasm / frustration emojis — not genuine praise */
const NEGATIVE_EMOJI_PATTERN = /🙄|😒|👎|😤|💀/;

/** Customer distress — route to empathy-first replies, not generic complaint */
const DISTRESS_EMOJI_PATTERN = /😢|😭|💔|😞|😔|🥺|😡|🤬/;

const GLOBAL_ESCALATION_TRIGGERS = [
    "lawyer", "legal action", "sue", "lawsuit", "police", " FIR ",
    "consumer court", "consumer forum", "RBI", "media", "journalist",
    "news channel", "viral", "expose",
];

/** Suggested actions when no guidebook category matches, or for spam/abuse buckets */
const FLAGGED_REPLY_TEMPLATES = Object.freeze({
    spam:
        "Hi {{username}}, we've noted this as promotional/spam content. " +
        "[Team action: hide on-platform — no public engagement recommended.]",
    abuse:
        "[Team action: Do not reply with a customer-service template. " +
        "Escalate to moderation/HR and consider hiding on-platform.]",
    negativeFallback:
        "Hi {{username}}, thank you for sharing your feedback — we're sorry to hear about {{issue}}. " +
        "Please DM us your details and our team will look into this for you.",
});

const POSITIVE_INDICATORS = [
    "love", "loved", " amazing ", " awesome ", " great ", " excellent ",
    " thank ", " thanks ", "thankyou", " best ", " perfect ", " beautiful ",
    " helpful ", " recommend ", " happy ", " satisfied ", " wonderful ",
    "👏", "❤", "🔥", "💯", "😍", "🙌",
];

// ── helpers ──

function hashText(text) {
    return crypto.createHash("sha256").update(text || "").digest("hex").slice(0, 16);
}

function normalize(text) {
    return (text || "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Porter-stem a single token; non-alpha tokens pass through lowercased */
function stemWord(word) {
    if (!word) return "";
    const w = word.toLowerCase();
    if (!/[a-z]/i.test(w)) return w;
    return stemmer.stem(w);
}

/** Stemmed forms of strong-signal words — inflections like "cheating" still count */
const STRONG_SIGNAL_STEMS = new Set(
    [...STRONG_SIGNAL_WORDS].map((w) => stemWord(w))
);

function tokenizeText(text) {
    const tokenizer = new natural.WordTokenizer();
    return (tokenizer.tokenize(normalize(text)) || []).filter(Boolean);
}

/** Stemmed token index for a comment — used for guidebook trigger matching */
function buildStemIndex(text) {
    const tokens = tokenizeText(text);
    const stems = tokens.map(stemWord);
    return {
        tokens,
        stems,
        stemSet: new Set(stems),
        stemmedText: stems.join(" "),
    };
}

function stemTriggerPhrase(trigger) {
    return trigger
        .trim()
        .toLowerCase()
        .split(/\s+/)
        .filter(Boolean)
        .map(stemWord);
}

/** True when stemmed trigger words appear consecutively in the comment (or as a single stem) */
function hasStemmedPhrase(stemIndex, triggerStems) {
    if (!triggerStems.length) return false;

    if (triggerStems.length === 1) {
        return stemIndex.stemSet.has(triggerStems[0]);
    }

    const { stems } = stemIndex;
    for (let i = 0; i <= stems.length - triggerStems.length; i++) {
        let ok = true;
        for (let j = 0; j < triggerStems.length; j++) {
            if (stems[i + j] !== triggerStems[j]) {
                ok = false;
                break;
            }
        }
        if (ok) return true;
    }

    return stemIndex.stemmedText.includes(triggerStems.join(" "));
}

function escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole-word match — avoids substring false positives (e.g. complain ⊃ complaint) */
function hasWordBoundaryMatch(norm, word) {
    if (!word) return false;
    return new RegExp(`\\b${escapeRegex(word)}\\b`, "i").test(norm);
}

/**
 * Match a trigger literally (phrases / Hinglish) or via Porter stems (inflections).
 * Single English words use word boundaries — the canonical guidebook path.
 */
function triggerMatches(norm, stemIndex, trigger) {
    const t = trigger.trim().toLowerCase();
    if (!t) return { matched: false };

    const core = coreTriggerWord(t);

    if (t.includes(" ")) {
        // Multi-word phrase: substring match
        if (norm.includes(t)) return { matched: true, matchType: "literal" };
    } else if (/[^\x00-\x7F]/.test(t)) {
        // Devanagari / non-Latin token
        if (norm.includes(t)) return { matched: true, matchType: "literal" };
    } else if (/^[a-z0-9]+$/i.test(core)) {
        // Single Latin word: whole-word only (English critical path)
        if (hasWordBoundaryMatch(norm, core)) {
            return { matched: true, matchType: "literal" };
        }
    } else if (norm.includes(t)) {
        // Punctuation / emoji triggers
        return { matched: true, matchType: "literal" };
    }

    if (!/[a-z]/i.test(t)) return { matched: false };

    const triggerStems = stemTriggerPhrase(t);
    if (hasStemmedPhrase(stemIndex, triggerStems)) {
        return { matched: true, matchType: "stem" };
    }

    return { matched: false };
}

function isStrongSignalTrigger(trigger) {
    const core = coreTriggerWord(trigger);
    if (core && STRONG_SIGNAL_WORDS.has(core)) return true;
    if (core && STRONG_SIGNAL_STEMS.has(stemWord(core))) return true;
    const stems = stemTriggerPhrase(trigger);
    return stems.some((s) => STRONG_SIGNAL_STEMS.has(s));
}

function countIndicatorHits(text, indicators) {
    const norm = normalize(text);
    return indicators.filter((i) => norm.includes(i.trim().toLowerCase())).length;
}

function hasGenuineSentiment(text) {
    const norm = normalize(text);
    if (!norm) return false;

    if (countIndicatorHits(text, POSITIVE_INDICATORS) > 0) return true;

    const tokenizer = new natural.WordTokenizer();
    const tokens = new Set((tokenizer.tokenize(norm) || []).map((t) => t.toLowerCase()));

    for (const w of GENUINE_POSITIVE_WORDS) {
        if (tokens.has(w) || norm.includes(` ${w} `) || norm.startsWith(`${w} `) || norm.endsWith(` ${w}`)) {
            return true;
        }
    }
    for (const w of GENUINE_NEGATIVE_WORDS) {
        if (tokens.has(w) || hasWordBoundaryMatch(norm, w)) return true;
    }

    if (analyzeHinglishSentiment(text).forceNegative) return true;

    const afinn = sentimentAnalyzer.analyze(text).score;
    if (afinn >= 3 || afinn <= -3) return true;

    return false;
}

function isSpam(text) {
    if (!text) return false;

    if (SPAM_PATTERNS.some((p) => p.test(text))) return true;

    if (REPEATED_CHAR_SPAM.test(text) && !hasGenuineSentiment(text)) return true;

    return false;
}

function isNegatedPositive(norm, word) {
    const w = escapeRegex(word);
    return new RegExp(`\\b(not|no|never|isn't|isnt|ain't|nt)\\s+${w}\\b`, "i").test(norm)
        || new RegExp(`\\b${w}\\s+(not|no)\\b`, "i").test(norm);
}

/** Cancel AFINN false boosts — "need help", "thanks but…", "good but…" */
function adjustAfinnScore(text, rawScore) {
    const norm = normalize(text);
    let score = rawScore;

    if (/\b(need|want|require|still waiting for|waiting for)\s+help\b/i.test(norm)) score -= 3;
    if (/\b(need help|help with|help me|please help|want help)\b/i.test(norm)) score -= 2;
    if (/\bthank(s| you)?\b/i.test(norm) && /\bbut\b/i.test(norm)) score -= 3;
    if (/\b(good|great|nice|love|fine)\b/i.test(norm) && /\bbut\b/i.test(norm)) score -= 3;
    if (NEGATIVE_EMOJI_PATTERN.test(text)) score -= 3;
    if (/\bnot\s+(great|good|nice|happy|helpful|worth|fine)\b/i.test(norm)) score -= 2;

    return score;
}

function hasMixedComplaintClause(text) {
    const norm = normalize(text);
    if (!/\bbut\b/i.test(norm)) return false;
    return /\b(wait|waiting|costly|expensive|issue|problem|refund|worst|bad|delay|crash|login|callback|respond|disappoint|angry|never|no update|not working)\b/i.test(norm);
}

/** Mild criticism softened with okay/fine — not a CS complaint */
function isSoftMixedNeutral(text) {
    const norm = normalize(text);
    if (!/\bnot\s+(great|good|nice|happy|bad|worst)\b/i.test(norm)) return false;
    return /\b(okay|ok|fine|alright|i guess|sort of|passable|acceptable)\b/i.test(norm);
}
/** Service / sales lead — configurable per account via playbook.leadInquiryTriggers */
function isDebtHelpLead(text) {
    const norm = normalize(text);
    if (!norm) return false;
    const debtCtx = /\b(credit card|credit cards|overdue|over due|outstanding|loans?|multiple loan|debt|emi|dues)\b/i.test(norm);
    const helpCtx = /\b(help me out|help me|can you help|please help|get me out|out of it|stuck in)\b/i.test(norm);
    return debtCtx && helpCtx;
}

function isServiceLeadInquiry(text, playbook = DEFAULT_PLAYBOOK) {
    if (playbook.neutralLeadsEnabled === false) return false;

    const norm = normalize(text);
    if (!norm) return false;

    if (isDebtHelpLead(text)) return true;

    const hasComplaintSignal = /\b(scam|fraud|worst|failed|fooling|cheat|refund|complaint|terrible|hate|disappoint|not satisfied|issue with|problem with|problem|issue|facing|unknown|fake call|fake agent|not resolved|not resolve|unresolved|don't use|do not use|loot|dhok|victim|overcharged|hidden charge|money back|never responded|no response|misleading|harassment|block kar|kuch nahi kiya|leke kuch)\b/i.test(norm);
    if (hasComplaintSignal || (hasStrongNegativeSignal(text) && !isDebtHelpLead(text))) return false;

    // Account-specific industry triggers (debt, EMI, settlement, etc.)
    for (const trigger of playbook.leadInquiryTriggers || []) {
        const t = normalize(trigger);
        if (t && norm.includes(t)) return true;
    }

    const genericLeadPatterns = [
        /\b(want|need|get|apply for|looking for)\b/i,
        /\b(please help|help me)\b/i,
        /\bhow (?:do|can) i (?:get|apply|book|order|buy)\b/i,
        /\bcan you help\b/i,
    ];
    return genericLeadPatterns.some((p) => p.test(norm));
}

function hasStrongNegativeSignal(text) {
    const norm = normalize(text);
    if (analyzeHinglishSentiment(text).forceNegative) return true;
    if (detectFuzzyCriticalWords(text).length > 0) return true;
    if (NEGATIVE_EMOJI_PATTERN.test(text)) return true;
    return GENUINE_NEGATIVE_WORDS.some((w) => hasWordBoundaryMatch(norm, w));
}

function isClearlyPositive(text) {
    if (!text || hasStrongNegativeSignal(text)) return false;

    const norm = normalize(text);
    if (hasMixedComplaintClause(text)) return false;
    if (/\b(need help|please help|help with|help me|want help)\b/i.test(norm)) return false;

    for (const w of GENUINE_POSITIVE_WORDS) {
        if (hasWordBoundaryMatch(norm, w) && isNegatedPositive(norm, w)) return false;
    }

    const afinn = adjustAfinnScore(text, sentimentAnalyzer.analyze(text).score);
    if (afinn <= 0) return false;

    const posHits = countIndicatorHits(text, POSITIVE_INDICATORS);
    const hinglish = analyzeHinglishSentiment(text);
    if (hinglish.forceNegative) return false;

    if (/[🙌👏❤😍🔥💯]/u.test(text) && posHits >= 1 && afinn >= 1) return true;
    if (afinn >= 3 && posHits >= 1) return true;
    if (posHits >= 2 && afinn >= 2) return true;

    if (posHits >= 1 && afinn >= 2 && !/\bbut\b/i.test(norm)) {
        const hasNegated = GENUINE_POSITIVE_WORDS.some(
            (w) => hasWordBoundaryMatch(norm, w) && isNegatedPositive(norm, w)
        );
        if (!hasNegated) return true;
    }

    return false;
}

/** Questions and polite contact requests — not complaints */
function isNeutralInquiry(text) {
    const norm = normalize(text);
    if (!norm || norm.length > 140) return false;
    if (hasStrongNegativeSignal(text)) return false;

    // Complaint-style questions are not neutral inquiries
    if (/\b(where is my|when will i|why hasn't|why hasnt|still waiting|waiting for|never got|no update|not received|not delivered|no callback yet|haven't received)\b/i.test(norm)) {
        return false;
    }

    const requestPatterns = [
        /\b(call me back|call back|reach me|contact me|get in touch)\b/i,
        /\b(please call|pls call|call me)\b/i,
    ];
    if (requestPatterns.some((p) => p.test(norm))) return true;

    if (!/\?/.test(text)) return false;

    const inquiryPatterns = [
        /\b(do you|have you|can you|could you|would you|is there|are there|you have)\b/i,
        /\b(whatsapp|contact|number|phone|email|dm|call|reach|details)\b/i,
        /\b(how|what|when|where|which)\b/i,
    ];

    if (!inquiryPatterns.some((p) => p.test(norm))) return false;

    const afinn = adjustAfinnScore(text, sentimentAnalyzer.analyze(text).score);
    return afinn >= -2;
}

function getSentimentIntensity(score) {
    const abs = Math.abs(score);
    if (abs >= 6) return "severe";
    if (abs >= 3) return "moderate";
    return "mild";
}

function computeSentiment(text) {
    if (isClearlyPositive(text)) {
        return {
            sentiment: "positive",
            sentimentScore: 5,
            sentimentConfidence: 85,
            intensity: "moderate",
            hinglishHits: [],
            fuzzyHits: [],
        };
    }

    if (isNeutralInquiry(text)) {
        return {
            sentiment: "neutral",
            sentimentScore: 0,
            sentimentConfidence: 72,
            intensity: "mild",
            hinglishHits: [],
            fuzzyHits: [],
        };
    }

    if (isSoftMixedNeutral(text)) {
        return {
            sentiment: "neutral",
            sentimentScore: 0,
            sentimentConfidence: 68,
            intensity: "mild",
            hinglishHits: [],
            fuzzyHits: [],
        };
    }

    const result = sentimentAnalyzer.analyze(text || "");
    const hinglish = analyzeHinglishSentiment(text);
    const fuzzyHits = detectFuzzyCriticalWords(text);

    // AFINN treats "help" as positive — ignore English positive boost in Hinglish negations
    let posHits = 0;
    if (!hasFalsePositiveEnglishContext(text) && hinglish.hits.length === 0 && fuzzyHits.length === 0) {
        posHits = countIndicatorHits(text, POSITIVE_INDICATORS);
    }

    let score = adjustAfinnScore(text, result.score) + posHits * 2 + hinglish.scoreAdjustment;
    if (fuzzyHits.length) {
        score -= 8 + Math.min(fuzzyHits.length * 3, 6);
    }

    // Hinglish / fuzzy fraud typo — don't let English NLP classify as positive/neutral
    if ((hinglish.forceNegative || fuzzyHits.length) && score > -3) {
        score = Math.min(score, -6);
    }

    let sentiment;
    let confidence;

    if (score <= -4) {
        sentiment = "negative";
        confidence = Math.min(95, 60 + Math.abs(score) * 4);
    } else if (score >= 4) {
        sentiment = "positive";
        confidence = Math.min(90, 55 + score * 4);
    } else if (score <= -1) {
        sentiment = "negative";
        confidence = Math.min(75, 45 + Math.abs(score) * 8);
    } else if (score >= 1) {
        sentiment = "positive";
        confidence = Math.min(70, 40 + score * 8);
    } else {
        sentiment = "neutral";
        confidence = 50;
    }

    // Hinglish / fuzzy keyword hits override weak English "positive"
    if ((hinglish.forceNegative || fuzzyHits.length) && sentiment === "positive") {
        sentiment = "negative";
        confidence = Math.max(confidence, 80);
        score = Math.min(score, -5);
    }

    if (hinglish.hits.length > 0 && sentiment === "negative") {
        confidence = Math.max(confidence, 72 + Math.min(hinglish.hits.length * 4, 20));
    }

    if (fuzzyHits.length > 0 && sentiment === "negative") {
        confidence = Math.max(confidence, 78 + Math.min(fuzzyHits.length * 3, 12));
    }

    return {
        sentiment,
        sentimentScore: score,
        sentimentConfidence: Math.round(confidence),
        intensity: getSentimentIntensity(score),
        hinglishHits: hinglish.hits,
        fuzzyHits,
    };
}

function matchGuidebookEntry(text, entry) {
    const norm = normalize(text);
    const stemIndex = buildStemIndex(text);

    const matchedTriggers = [];
    let weightedScore = 0;

    for (const trigger of entry.triggers || []) {
        const { matched, matchType } = triggerMatches(norm, stemIndex, trigger);
        if (!matched) continue;

        const t = trigger.trim().toLowerCase();
        matchedTriggers.push(trigger.trim());
        weightedScore += scoreTriggerMatch(t, matchType);
    }

    if (matchedTriggers.length === 0) return null;

    let confidence = Math.min(98, weightedScore);

    const hasPhraseMatch = matchedTriggers.some((tr) => tr.includes(" "));
    if (hasPhraseMatch && confidence < 55) confidence = 55;

    const hasStrongWord = matchedTriggers.some((tr) => isStrongSignalTrigger(tr));
    if (hasStrongWord && HIGH_SIGNAL_CATEGORIES.has(entry.category) && confidence < 48) {
        confidence = 48;
    }

    if (matchedTriggers.length >= 2) confidence = Math.min(98, confidence + 12);
    if (matchedTriggers.length >= 3) confidence = Math.min(98, confidence + 8);

    if (confidence < (entry.confidenceThreshold || 50)) return null;

    return {
        guidebook: entry,
        matchedTriggers,
        matchConfidence: confidence,
    };
}

const CONTEXT_ONLY_MATCH_CAP = 55;

function applyMatchConfidenceCaps(match) {
    if (!match) return match;
    if (isWeakContextOnlyMatch(match)) {
        match.matchConfidence = Math.min(match.matchConfidence, CONTEXT_ONLY_MATCH_CAP);
    }
    return match;
}

function isExampleOnlyMatch(match) {
    const triggers = match.matchedTriggers || [];
    if (!triggers.length) return false;
    return triggers.every((t) => t.startsWith("example:"));
}

function compareCategoryMatches(a, b) {
    const weakA = isWeakContextOnlyMatch(a);
    const weakB = isWeakContextOnlyMatch(b);
    const exampleA = isExampleOnlyMatch(a);
    const exampleB = isExampleOnlyMatch(b);

    // Real trigger hits beat example-only or context-only inference
    if (exampleA !== exampleB) {
        if (exampleA && !exampleB && b.matchConfidence >= a.matchConfidence - 5) return 1;
        if (exampleB && !exampleA && a.matchConfidence >= b.matchConfidence - 5) return -1;
    }

    // Strong guidebook hits beat a lone context:pricing-style inference
    if (weakA !== weakB) {
        if (weakA && !weakB && b.matchConfidence >= a.matchConfidence + 8) return 1;
        if (weakB && !weakA && a.matchConfidence >= b.matchConfidence + 8) return -1;
    }

    const rankA = CATEGORY_RANK[a.guidebook.category] || 0;
    const rankB = CATEGORY_RANK[b.guidebook.category] || 0;
    if (rankB !== rankA) return rankB - rankA;
    return b.matchConfidence - a.matchConfidence;
}

function mergeCategoryMatches(matches) {
    const byCategory = new Map();

    for (const match of matches) {
        const category = match.guidebook?.category;
        if (!category) continue;

        const existing = byCategory.get(category);
        if (!existing) {
            byCategory.set(category, applyMatchConfidenceCaps({
                ...match,
                matchedTriggers: [...match.matchedTriggers],
            }));
            continue;
        }

        existing.matchConfidence = Math.max(existing.matchConfidence, match.matchConfidence);
        applyMatchConfidenceCaps(existing);
        for (const trigger of match.matchedTriggers) {
            if (!existing.matchedTriggers.includes(trigger)) {
                existing.matchedTriggers.push(trigger);
            }
        }
    }

    return [...byCategory.values()].sort(compareCategoryMatches);
}

function pickPrimaryCategoryMatch(matches) {
    if (!matches?.length) return null;
    return mergeCategoryMatches(matches)[0];
}

function matchGuidebook(text, guidebooks) {
    const matches = [];

    for (const entry of guidebooks) {
        if (entry.isActive === false) continue;
        const match = matchGuidebookEntry(text, entry);
        if (match) matches.push(match);
    }

    return mergeCategoryMatches(matches);
}

function inferGuidebookFromContext(text, guidebooks) {
    if (!text || !guidebooks?.length) return [];

    const norm = normalize(text);
    const rules = [
        {
            category: "poor_service",
            pattern: /\b(don't use|do not use|not resolved|not resolve|unresolved|troubling|more trouble|facing trouble|bad service|worst service|no help|never responded|not happy|disappointed|useless)\b/i,
            confidence: 60,
        },
        {
            category: "pricing",
            pattern: /\b(price|prices|pricing|recharge|plan|badh|badenge|mehenga|mahnga|costly|expensive|overpriced|refund|billing|payment|debts?|lakh|pay more|not free|charges|charge|\d{3,}\s*leke|leke kuch|kuch nahi kiya)\b/i,
            confidence: 62,
        },
        {
            category: "delay",
            pattern: /\b(waiting|delay|delayed|delivered|delivery|late|not received|not arrived)\b/i,
            confidence: 58,
        },
        {
            category: "technical_issue",
            pattern: /\b(not working|doesn't work|doesnt work|broken|crash|error|bug|login|app|whatsapp|whats app|unknown no|not receive|don't receive|dont receive|phone number|number lag|lag nahi|call nahi|not connecting|loan agent|call cut|cut kr|number block|block kar)\b/i,
            confidence: 58,
        },
        {
            category: "scam_fraud",
            pattern: /\b(i am a victim|i'm a victim|i am victim|victim of|being victimized|cheated me|stole my money)\b/i,
            confidence: 70,
        },
        {
            category: "accusation",
            pattern: /\b(harassment|harrasment|harassing|harassed|misleading|dishonest|false promise|you lied|fooling|fool people|failed terribly|failed badly)\b/i,
            confidence: 65,
        },
        {
            category: "angry_customer",
            pattern: /\b(angry|furious|rage|ridiculous|outraged|so mad|very mad|never buying|worst company)\b|\bnever\b[\s\S]{0,30}\bagain\b|😭|😢|💔|😞|😔|🥺|😡|🤬/u,
            confidence: 62,
        },
        {
            category: "complaint",
            pattern: /\b(complaint|issue with|problem with|not satisfied|disappointed|unacceptable|having trouble|troubling|facing trouble|not resolved|resolve this)\b|🙄|😒/u,
            confidence: 52,
        },
    ];

    const matches = [];
    for (const rule of rules) {
        if (!rule.pattern.test(norm)) continue;
        const guidebook = guidebooks.find((g) => g.category === rule.category);
        if (!guidebook) continue;
        matches.push({
            guidebook,
            matchedTriggers: [`context:${rule.category}`],
            matchConfidence: rule.confidence,
        });
    }

    return matches;
}

function collectCategoryMatches(text, guidebooks, sentimentResult) {
    const matches = [...matchGuidebook(text, guidebooks)];

    matches.push(...matchGuidebookFromExamples(text, guidebooks));

    const hinglishMatches = inferAllGuidebooksFromHinglish(
        sentimentResult?.hinglishHits,
        guidebooks,
        text
    );
    matches.push(...hinglishMatches);

    const fuzzyMatch = inferGuidebookFromFuzzy(sentimentResult?.fuzzyHits, guidebooks);
    if (fuzzyMatch) matches.push(fuzzyMatch);

    matches.push(...inferGuidebookFromContext(text, guidebooks).filter((contextMatch) => {
        const category = contextMatch.guidebook?.category;
        const existing = matches.find((m) => m.guidebook?.category === category);
        if (!existing) return true;
        return isWeakContextOnlyMatch(existing);
    }));

    return mergeCategoryMatches(matches);
}

function toCategoryMatchRecords(matches) {
    return matches.map((match) => ({
        category: match.guidebook.category,
        guidebookId: match.guidebook._id || null,
        confidence: match.matchConfidence,
        triggers: [...match.matchedTriggers],
    }));
}

function flattenMatchedTriggers(categoryMatches, hinglishHits = [], fuzzyHits = []) {
    const triggers = [];

    for (const match of categoryMatches) {
        for (const trigger of match.matchedTriggers) {
            if (!triggers.includes(trigger)) triggers.push(trigger);
        }
    }

    for (const hit of hinglishHits) {
        const tagged = `hinglish:${hit}`;
        if (!triggers.some((t) => t.includes(hit))) triggers.push(tagged);
    }

    for (const hit of fuzzyHits) {
        const tagged = `fuzzy:${hit.token}→${hit.canonical}`;
        if (!triggers.some((t) => t.includes(hit.token))) triggers.push(tagged);
    }

    return triggers;
}

function detectEscalation(text, categoryMatches) {
    const norm = normalize(text);
    const stemIndex = buildStemIndex(text);
    const reasons = [];

    for (const t of GLOBAL_ESCALATION_TRIGGERS) {
        if (triggerMatches(norm, stemIndex, t).matched) reasons.push(`global:${t.trim()}`);
    }

    for (const match of categoryMatches || []) {
        for (const t of match.guidebook?.escalationTriggers || []) {
            if (triggerMatches(norm, stemIndex, t).matched) {
                reasons.push(`${match.guidebook.category}:${t.trim()}`);
            }
        }
    }

    return reasons;
}

function resolvePriority(sentiment, categoryMatches, escalationReasons) {
    if (escalationReasons.length >= 1) return "critical";

    let maxPriority = "normal";

    for (const match of categoryMatches || []) {
        const category = match.guidebook?.category;
        if (category === "scam_fraud" || category === "accusation") return "critical";
        if (match.guidebook?.defaultPriority === "critical") return "critical";

        const priority = match.guidebook?.defaultPriority || "normal";
        if ((PRIORITY_RANK[priority] || 0) > (PRIORITY_RANK[maxPriority] || 0)) {
            maxPriority = priority;
        }
    }

    const primary = pickPrimaryCategoryMatch(categoryMatches);
    if (sentiment === "negative" && primary?.matchConfidence >= 70 && maxPriority === "normal") {
        return "high";
    }

    return maxPriority;
}

function resolveRecommendedAction(categoryMatches, priority, sentiment) {
    if (priority === "critical") {
        const hasScamOrAccusation = (categoryMatches || []).some((match) =>
            ["scam_fraud", "accusation"].includes(match.guidebook?.category)
        );
        if (hasScamOrAccusation) return "internal_review";
        return "escalate_legal";
    }

    const primary = pickPrimaryCategoryMatch(categoryMatches);
    if (primary?.guidebook?.recommendedAction) {
        return primary.guidebook.recommendedAction;
    }
    if (sentiment === "positive" || sentiment === "neutral") return "no_action";
    return "reply_publicly";
}

function extractIssueSnippet(text, category) {
    const norm = normalize(text);
    if (!norm) return null;

    const patterns = {
        technical_issue: [
            /what'?s app[^.?!]{0,80}/i,
            /whatsapp[^.?!]{0,80}/i,
            /unknown no[^.?!]{0,60}/i,
            /loan agents?[^.?!]{0,50}/i,
            /number lag nahi raha hai/i,
            /lag nahi raha hai/i,
            /not working[^.?!]{0,50}/i,
            /(?:not|don't|dont) receive[^.?!]{0,60}/i,
        ],
        pricing: [
            /pais[ae][\s\S]{0,25}kha\s+(gye|gaye|liye)/i,
            /pasise[\s\S]{0,25}kha/i,
            /debt free[^.?!]{0,70}/i,
            /\d+\s*lakh[^.?!]{0,50}/i,
            /pay more[^.?!]{0,50}/i,
            /(?:too )?expensive[^.?!]{0,50}/i,
            /refund[^.?!]{0,50}/i,
            /not a debt[^.?!]{0,50}/i,
        ],
        accusation: [
            /harr?assment[^.?!]{0,70}/i,
            /fooling people[^.?!]{0,50}/i,
            /failed terribly[^.?!]{0,50}/i,
            /misleading[^.?!]{0,50}/i,
        ],
        poor_service: [
            /customer service[^.?!]{0,60}/i,
            /no response[^.?!]{0,50}/i,
            /not resolved[^.?!]{0,50}/i,
            /facing more troubling[^.?!]{0,50}/i,
            /more trouble[^.?!]{0,50}/i,
            /don't use[^.?!]{0,60}/i,
            /do not use[^.?!]{0,60}/i,
        ],
        scam_fraud: [
            /\b(i am a victim|i am victim|victim of|being victimized)\b/i,
            /scam[^.?!]{0,50}/i,
            /fraud[^.?!]{0,50}/i,
            /trust mat[^.?!]{0,50}/i,
        ],
    };

    for (const pattern of patterns[category] || []) {
        const match = norm.match(pattern);
        if (match) return match[0].trim().slice(0, 80);
    }

    return null;
}

function pickHumanIssueFromMatch(match, commentText = "") {
    const triggers = match.matchedTriggers || [];
    const category = match.guidebook?.category;

    const real = triggers
        .filter(
            (t) =>
                !t.startsWith("hinglish:")
                && !t.startsWith("fuzzy:")
                && !t.startsWith("context:")
                && !t.startsWith("abuse:")
                && !t.startsWith("example:")
                && t !== "general concern"
        )
        .sort((a, b) => b.length - a.length);

    const commentLen = (commentText || "").trim().length;
    const hinglishLabel = resolveHinglishIssueLabel(commentText);

    if (real.length) {
        const bestTrigger = real[0];
        const snippet = category ? extractIssueSnippet(commentText, category) : null;
        if (snippet && snippet.length >= Math.max(14, bestTrigger.length + 4) && isEmbeddableIssue(snippet, commentText)) {
            return snippet;
        }
        if (commentLen > 40 && bestTrigger.length < 14 && hinglishLabel) return hinglishLabel;
        if (commentLen > 40 && bestTrigger.length < 14) return null;
        if (isEmbeddableIssue(bestTrigger, commentText)) return bestTrigger;
    }

    if (hinglishLabel) return hinglishLabel;

    const hinglish = triggers.find((t) => t.startsWith("hinglish:"))?.replace(/^hinglish:/, "");
    if (hinglish && hinglishLabel) return hinglishLabel;

    const fuzzy = triggers.find((t) => t.startsWith("fuzzy:"))?.replace(/^fuzzy:[^→]+→/, "");
    if (fuzzy && isEmbeddableIssue(fuzzy, commentText)) return fuzzy;

    const snippet = category ? extractIssueSnippet(commentText, category) : null;
    if (snippet && isEmbeddableIssue(snippet, commentText)) return snippet;

    return null;
}

function isWeakContextOnlyMatch(match) {
    const triggers = match.matchedTriggers || [];
    if (!triggers.length) return true;
    return triggers.every((t) => t.startsWith("context:") || t === "general concern");
}

function buildCompositeIssue(categoryMatches, commentText = "") {
    if (!categoryMatches?.length) return "your concern";

    const triggerIssues = [];
    for (const match of categoryMatches) {
        const issue = pickHumanIssueFromMatch(match, commentText);
        if (issue && !triggerIssues.includes(issue)) triggerIssues.push(issue);
    }

    if (triggerIssues.length >= 2) {
        return triggerIssues.slice(0, 2).join(" and ");
    }
    if (triggerIssues.length === 1) return triggerIssues[0];

    return "your concern";
}

function capIssueWords(phrase, maxWords = MAX_ISSUE_WORDS) {
    if (!phrase) return phrase;
    const cleaned = phrase.trim().replace(/\s+/g, " ");
    const words = cleaned.split(" ");
    if (words.length <= maxWords) return cleaned;
    return `${words.slice(0, maxWords).join(" ")}…`;
}

function humanizeIssueForTemplate(issue) {
    if (!issue || issue === "your concern") return issue;
    let s = humanizeConcernPhrase(issue);
    s = capIssueWords(s, MAX_ISSUE_WORDS);
    if (/^[A-Z]/.test(s) && !/^(I |We |My |SingleDebt|Singledebt)/.test(s)) {
        s = s.charAt(0).toLowerCase() + s.slice(1);
    }
    return s;
}

function fillTemplate(template, { username, issue, brand, cta, ctaUrgent }) {
    if (!template) return "";
    const resolvedIssue = humanizeIssueForTemplate(issue) || "your concern";
    return template
        .replace(/\{\{username\}\}/gi, displayUsername(username))
        .replace(/\{\{issue\}\}/gi, resolvedIssue)
        .replace(/\{\{brand\}\}/gi, brand || "our team")
        .replace(/\{\{cta_urgent\}\}/gi, ctaUrgent || cta || DEFAULT_PLAYBOOK.replyCtaUrgent)
        .replace(/\{\{cta\}\}/gi, cta || DEFAULT_PLAYBOOK.replyCta);
}

    function sanitizeReplyFraming(reply) {
        if (!reply) return "";
        return reply
        .replace(/\ballegations?\s+like\s+(your\s+[^.!?]*?\s+allegation)\b/gi, "$1")
        .replace(/\bconcern\s+(about|regarding)\s+(your\s+[^.!?]*?\s+concern)\b/gi, "$2");
    }

/** Avoid "Hi Unknown" when platform didn't provide a real name */
function displayUsername(username) {
    const u = (username || "").trim();
    if (!u || /^(unknown|anonymous)$/i.test(u)) return "there";
    return u;
}

function pickTemplate(guidebook, intensity) {
    if (!guidebook) return null;
    const variants = guidebook.templates || {};
    if (intensity === "severe" && variants.severe) return variants.severe;
    if (intensity === "moderate" && variants.moderate) return variants.moderate;
    if (intensity === "mild" && variants.mild) return variants.mild;
    return guidebook.template;
}

function inferGuidebookFromHinglish(hinglishHits, guidebooks, text = "") {
    if (!hinglishHits?.length || !guidebooks?.length) return null;

    const joined = hinglishHits.join(" ").toLowerCase();
    const norm = normalize(text || joined);

    let category = null;
    if (/loot|dhok|farzi|nakli|scam|fraud|froud|trust mat|chor|cheat kiya|chutiya|bewakoof|thug/.test(`${joined} ${norm}`)) {
        category = "scam_fraud";
    } else if (/refund|pais[ae]|pasise|kha gaye|kha gye|kha liye|payment k baad|payment ke baad|money back|double charged|billing/.test(`${joined} ${norm}`)) {
        category = "pricing";
    } else if (/help\s+(na|mat|ni|nahi)|mat\s+(lo|le|karo)|bekar|bakwas|ghatiy|kharab|paise barbad/.test(`${joined} ${norm}`)) {
        category = "poor_service";
    }

    if (!category) return null;

    const guidebook = guidebooks.find((g) => g.category === category);
    if (!guidebook) return null;

    return {
        guidebook,
        matchedTriggers: hinglishHits.map((h) => `hinglish:${h}`),
        matchConfidence: category === "scam_fraud" ? 78 : 68,
    };
}

function inferAllGuidebooksFromHinglish(hinglishHits, guidebooks, text = "") {
    if (!hinglishHits?.length || !guidebooks?.length) return [];

    const joined = hinglishHits.join(" ").toLowerCase();
    const norm = normalize(text || joined);
    const blob = `${joined} ${norm}`;
    const matches = [];

    const rules = [
        { category: "scam_fraud", pattern: /loot|dhok|farzi|nakli|scam|fraud|froud|trust mat|chor|cheat kiya|chutiya|bewakoof|thug|\bvictim\b|i am victim|i am a victim/, confidence: 78 },
        { category: "pricing", pattern: /refund|pais[ae]|pasise|kha gaye|kha gye|kha liye|payment k baad|payment ke baad|money back|double charged|billing|price|prices|recharge|badh|badenge|mehenga|debt|lakh|pay more|leke kuch nahi|kuch nahi kiya|\d{3,}\s*leke/, confidence: 72 },
        { category: "poor_service", pattern: /help\s+(na|mat|ni|nahi)|mat\s+(lo|le|karo)|bekar|bakwas|ghatiy|kharab|paise barbad|harassment|harrasment/, confidence: 68 },
        { category: "technical_issue", pattern: /whatsapp|whats app|number lag|lag nahi|call nahi|not receive|unknown no|loan agent|not working|login|call bhi cut|cut kr dete|call cut|number block|block kar/, confidence: 70 },
    ];

    for (const rule of rules) {
        if (!rule.pattern.test(blob)) continue;
        const guidebook = guidebooks.find((g) => g.category === rule.category);
        if (!guidebook) continue;
        matches.push({
            guidebook,
            matchedTriggers: hinglishHits.map((h) => `hinglish:${h}`),
            matchConfidence: rule.confidence,
        });
    }

    return matches;
}

function inferGuidebookFromFuzzy(fuzzyHits, guidebooks) {
    if (!fuzzyHits?.length || !guidebooks?.length) return null;

    const guidebook = guidebooks.find((g) => g.category === "scam_fraud");
    if (!guidebook) return null;

    return {
        guidebook,
        matchedTriggers: fuzzyHits.map((h) => `fuzzy:${h.token}→${h.canonical}`),
        matchConfidence: 76,
    };
}

function humanizeConcernPhrase(phrase) {
    return (phrase || "")
        .trim()
        .replace(/^["']|["']$/g, "")
        .replace(/\s+/g, " ")
        .replace(/^[,.;\s]+|[,.;\s]+$/g, "");
}

function extractCommentConcern(text, maxLen = 95, triggerHints = []) {
    if (!text?.trim()) return null;

    const cleaned = text
        .replace(/@\w+/g, "")
        .replace(/https?:\/\/\S+/gi, "")
        .replace(/\s+/g, " ")
        .trim();
    if (!cleaned) return null;

    const sentences = cleaned
        .split(/(?<=[.!?])\s+|\n+/)
        .map((s) => s.trim())
        .filter((s) => s.length > 6);

    const scoreSentence = (s) => {
        const n = normalize(s);
        let score = 0;
        for (const w of GENUINE_NEGATIVE_WORDS) {
            if (hasWordBoundaryMatch(n, w)) score += 2;
        }
        if (/\b(don't|not |never|no |worst|failed|scam|fraud|refund|waiting|help|issue|problem|charge|trouble)\b/i.test(n)) {
            score += 1;
        }
        return score + Math.min(s.length / 35, 4);
    };

    const realHints = (triggerHints || [])
        .map((h) => h.trim())
        .filter((h) => h && !h.startsWith("context:") && !h.startsWith("hinglish:") && !h.startsWith("fuzzy:") && h !== "general concern");

    if (realHints.length && sentences.length) {
        for (const hint of realHints.sort((a, b) => b.length - a.length)) {
            const hit = sentences.find((s) => normalize(s).includes(normalize(hint)));
            if (hit) {
                return trimConcernLength(humanizeConcernPhrase(hit), maxLen);
            }
        }
    }

    let best = sentences.length
        ? [...sentences].sort((a, b) => scoreSentence(b) - scoreSentence(a))[0]
        : cleaned;

    if (sentences.length <= 1 && cleaned.length <= maxLen) best = cleaned;

    const result = trimConcernLength(humanizeConcernPhrase(best), maxLen);
    if (result && isHinglishDominant(cleaned) && !resolveHinglishIssueLabel(cleaned)) {
        return null;
    }
    if (result && issueEchoesComment(result, cleaned)) {
        return null;
    }
    return result;
}

function trimConcernLength(phrase, maxLen) {
    if (!phrase) return null;
    if (phrase.length <= maxLen) return phrase;
    return phrase.slice(0, maxLen).replace(/\s+\S*$/, "").trim();
}

/** Embed the customer's actual words naturally in a reply sentence */
function formatConcernForSentence(concern) {
    if (!concern || concern === "your concern") return "about your experience with us";

    const c = humanizeConcernPhrase(concern);
    if (!c) return "about your experience with us";

    if (c.length <= 22 && !/\s/.test(c)) {
        return `about "${c}"`;
    }
    if (c.length <= 22) {
        return `about "${c}"`;
    }

    const lower = c
        .replace(/^but\s+/i, "")
        .replace(/^and\s+/i, "")
        .replace(/^so\s+/i, "")
        .replace(/\bu\b/g, "you");
    const formatted = /^[A-Z]/.test(lower) && !/^(I|We|My|Our|You)\b/.test(lower)
        ? lower.charAt(0).toLowerCase() + lower.slice(1)
        : lower;
    return `that ${formatted}`;
}

function isDistressOnlyComment(text) {
    const cleaned = (text || "").replace(/@\w+/g, "").trim();
    if (!cleaned || !DISTRESS_EMOJI_PATTERN.test(cleaned)) return false;

    const withoutEmoji = cleaned
        .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{200D}\u{FE0F}]/gu, "")
        .replace(/[^\w\s']/g, " ")
        .replace(/\s+/g, " ")
        .trim();

    if (!withoutEmoji) return true;

    const words = withoutEmoji.split(/\s+/).filter(Boolean);
    if (words.length <= 3 && /^(hi+|hello|hey|hii|hlo|help|please|ok+|okay)[\s!?]*$/i.test(withoutEmoji)) {
        return true;
    }
    return words.length <= 1;
}

function hasDistressEmoji(text) {
    return DISTRESS_EMOJI_PATTERN.test(text || "");
}

function isVagueCommentForQuote(text) {
    const cleaned = (text || "").replace(/@\w+/g, "").replace(/https?:\/\/\S+/gi, "").trim();
    if (!cleaned || cleaned.length > 42) return false;
    const words = cleaned.split(/\s+/).filter(Boolean);
    return words.length <= 6 && !/[.!?]{2,}/.test(cleaned);
}

/** Category-aware issue phrasing — avoids pasting raw vague comments into every template */
function humanizeCategoryConcern(text, category, triggerHints = []) {
    const norm = normalize(text || "");
    if (!norm || !category) return null;

    if (category === "scam_fraud" && /\bvictim\b/.test(norm)) {
        return "you feel you've been victimized";
    }
    const hinglishLabel = resolveHinglishIssueLabel(text);
    if (hinglishLabel) return hinglishLabel;

    if (category === "pricing" && /pasise|pais[ae]|kha gaye|kha gye|kha liye|refund|money back/.test(norm)) {
        return "your payment or refund concern";
    }
    if (category === "poor_service" && /not resolved|unresolved|don't use|do not use/.test(norm)) {
        return "your unresolved service issue";
    }
    if (isDistressOnlyComment(text) || (isVagueCommentForQuote(text) && hasDistressEmoji(text))) {
        return "this difficult time";
    }
    if (isVagueCommentForQuote(text) && (category === "complaint" || category === "angry_customer")) {
        return "your recent experience";
    }
    if (category === "accusation" && /fool|misleading|lied|dishonest/.test(norm)) {
        const snippet = extractIssueSnippet(text, category);
        if (snippet && snippet.length > 12) return snippet;
    }

    const realHints = (triggerHints || [])
        .filter((h) => h && !h.startsWith("context:") && !h.startsWith("hinglish:") && !h.startsWith("fuzzy:") && h !== "general concern");
    if (realHints.length) return humanizeConcernPhrase(realHints.sort((a, b) => b.length - a.length)[0]);

    const snippet = extractIssueSnippet(text, category);
    if (snippet && (!isVagueCommentForQuote(text) || snippet.length > 14)) return snippet;

    return null;
}

function mergeConcernForReply(text, categoryMatches, primary) {
    const category = primary?.guidebook?.category;
    const hints = primary?.matchedTriggers || [];
    const hinglishLabel = resolveHinglishIssueLabel(text);
    const fromTriggers = buildCompositeIssue(primary ? [primary] : categoryMatches, text);
    const fromComment = extractCommentConcern(text, 95, hints);
    const categoryIssue = humanizeCategoryConcern(text, category, hints);

    if (hinglishLabel) return hinglishLabel;

    if (isVagueCommentForQuote(text) && category) {
        if (categoryIssue && isEmbeddableIssue(categoryIssue, text)) return categoryIssue;
        if (fromTriggers && fromTriggers !== "your concern" && isEmbeddableIssue(fromTriggers, text)) {
            return capIssueWords(fromTriggers);
        }
        if (hasDistressEmoji(text)) return null;
        return null;
    }

    const cleanedLen = (text || "").replace(/@\w+/g, "").trim().length;
    const preferTrigger = cleanedLen > LONG_COMMENT_CHARS || isHinglishDominant(text);

    if (preferTrigger) {
        if (categoryIssue && isEmbeddableIssue(categoryIssue, text)) return categoryIssue;
        if (fromTriggers && fromTriggers !== "your concern" && isEmbeddableIssue(fromTriggers, text)) {
            return capIssueWords(fromTriggers);
        }
        if (fromComment && isEmbeddableIssue(fromComment, text)) return capIssueWords(fromComment);
        return null;
    }

    if (categoryIssue && isEmbeddableIssue(categoryIssue, text)) return categoryIssue;
    if (fromTriggers && fromTriggers !== "your concern" && isEmbeddableIssue(fromTriggers, text)) {
        return capIssueWords(fromTriggers);
    }
    if (fromComment && isEmbeddableIssue(fromComment, text)) return capIssueWords(fromComment);

    return null;
}

/** Compose reply from account guidebook template + customer comment + account playbook CTAs */
function composeTailoredReply({
    category,
    concern,
    secondaryConcerns = [],
    intensity = "moderate",
    brandName = "our team",
    guidebook = null,
    playbook = DEFAULT_PLAYBOOK,
    commentText = "",
    matchMeta = {},
}) {
    const pb = playbook || DEFAULT_PLAYBOOK;
    const embedIssue = shouldEmbedIssueInReply(concern, commentText, matchMeta);
    const templateVars = {
        username: "{{username}}",
        issue: embedIssue ? concern : "your concern",
        brand: brandName,
        cta: pb.replyCta,
        ctaUrgent: pb.replyCtaUrgent,
    };

    const template = pickReplyTemplate({ guidebook, category, intensity, embedIssue });
    let reply = sanitizeReplyFraming(fillTemplate(template, templateVars));

    const extras = secondaryConcerns.filter(
        (s) => s && s !== concern && s !== "your concern" && !String(concern).includes(s)
            && shouldEmbedIssueInReply(s, commentText, matchMeta)
    );
    if (extras.length > 0) {
        const also = extras.slice(0, 2).join(" and ");
        reply = `${reply.replace(/\s+$/, "")} We also noted ${also} — please mention this when you reach out.`;
    }

    const learnedReply = findLearnedApprovedReply(guidebook, commentText);
    if (learnedReply) return sanitizeReplyFraming(learnedReply);

    if (isSimilarToRejectedReply(guidebook, commentText, reply)) {
        const safeTemplate = pickReplyTemplate({ guidebook, category, intensity, embedIssue: false });
        reply = sanitizeReplyFraming(fillTemplate(safeTemplate, { ...templateVars, issue: "your concern" }));
    }

    return reply;
}

const TAILORED_REPLY_CTAS = Object.freeze({
    default: DEFAULT_PLAYBOOK.replyCta,
    urgent: DEFAULT_PLAYBOOK.replyCtaUrgent,
});

function buildSuggestedReply(text, categoryMatches, sentimentResult, brandName, guidebooks = [], playbook = DEFAULT_PLAYBOOK) {
    const sentiment = sentimentResult.sentiment;

    if (sentiment === "spam") {
        return {
            reply: fillTemplate(FLAGGED_REPLY_TEMPLATES.spam, {
                username: "{{username}}",
                issue: "spam content",
                brand: brandName,
            }),
            complaintFallbackUsed: false,
        };
    }

    if (sentiment === "abuse") {
        return { reply: FLAGGED_REPLY_TEMPLATES.abuse, complaintFallbackUsed: false };
    }

    if (sentiment !== "negative") return { reply: null, complaintFallbackUsed: false };

    let matches = categoryMatches || [];
    let primary = pickPrimaryCategoryMatch(matches);
    let complaintFallbackUsed = false;

    if (!primary?.guidebook) {
        const rescueMatches = mergeCategoryMatches([
            ...inferAllGuidebooksFromHinglish(sentimentResult?.hinglishHits, guidebooks, text),
            ...inferGuidebookFromContext(text, guidebooks),
        ]);
        if (rescueMatches.length) {
            matches = mergeCategoryMatches([...matches, ...rescueMatches]);
            primary = pickPrimaryCategoryMatch(matches);
        }
    }

    if (!primary?.guidebook) {
        primary = {
            guidebook: guidebooks.find((g) => g.category === "complaint") || { category: "complaint" },
            matchedTriggers: ["general concern"],
            matchConfidence: 50,
        };
        complaintFallbackUsed = true;
    } else if (
        primary.guidebook.category === "complaint"
        && primary.matchedTriggers?.every((t) => t === "general concern" || t.startsWith("context:"))
        && primary.matchConfidence <= 55
    ) {
        complaintFallbackUsed = true;
    }

    const category = primary.guidebook.category || "complaint";
    let guidebookEntry = guidebooks.find((g) => g.category === category) || primary.guidebook;
    let replyCategory = category;

    const weakComplaint =
        category === "complaint"
        && (
            complaintFallbackUsed
            || isWeakContextOnlyMatch(primary)
            || isDistressOnlyComment(text)
        );

    if (weakComplaint || (category === "complaint" && isDistressOnlyComment(text))) {
        const angryGuidebook = guidebooks.find((g) => g.category === "angry_customer");
        if (angryGuidebook) {
            guidebookEntry = angryGuidebook;
            replyCategory = "angry_customer";
            complaintFallbackUsed = false;
        }
    } else if (complaintFallbackUsed && category === "complaint") {
        const angryGuidebook = guidebooks.find((g) => g.category === "angry_customer");
        if (angryGuidebook) {
            guidebookEntry = angryGuidebook;
            replyCategory = "angry_customer";
        }
    }

    const concern = mergeConcernForReply(text, matches, primary);

    const secondaryMatches = matches.filter(
        (match) =>
            match.guidebook.category !== category
            && !isWeakContextOnlyMatch(match)
    );
    const secondaryConcerns = secondaryMatches.map((m) =>
        pickHumanIssueFromMatch(m, text)
    ).filter(Boolean);

    const reply = composeTailoredReply({
        category: replyCategory,
        concern,
        secondaryConcerns,
        intensity: sentimentResult.intensity,
        brandName,
        guidebook: guidebookEntry,
        playbook,
        commentText: text,
        matchMeta: {
            matchConfidence: primary.matchConfidence ?? 0,
            matchedTriggers: primary.matchedTriggers || [],
            weakMatch: isWeakContextOnlyMatch(primary),
            complaintFallbackUsed,
        },
    });

    return { reply, complaintFallbackUsed };
}

function computeOverallConfidence(sentimentConfidence, topMatchConfidence, {
    escalationReasons = [],
    categoryMatchCount = 0,
} = {}) {
    return Math.min(
        98,
        Math.round(
            (sentimentConfidence * 0.4) +
            (topMatchConfidence * 0.5) +
            (escalationReasons.length ? 10 : 0) +
            (categoryMatchCount > 1 ? 5 : 0)
        )
    );
}

/**
 * Core analysis — pure function, easy to unit test and swap engines later.
 */
function analyzeCommentText(text, guidebooks, options = {}) {
    const { brandName = "our team", skipSpamCheck = false, playbook = DEFAULT_PLAYBOOK } = options;

    if (!text || !text.trim()) {
        return {
            analysis: {
                sentiment: "neutral",
                sentimentScore: 0,
                sentimentConfidence: 50,
                classificationMethod: "hybrid",
                matchedCategory: null,
                matchedTriggers: [],
                matchConfidence: 0,
                overallConfidence: 50,
                priority: "normal",
                recommendedAction: "no_action",
                escalationReason: null,
                analyzedAt: new Date(),
                analyzedTextHash: hashText(text),
            },
            reply: { status: "unreviewed", suggestedReply: null },
        };
    }

    if (isServiceLeadInquiry(text, playbook)) {
        return {
            analysis: {
                sentiment: "neutral",
                sentimentScore: 1,
                sentimentConfidence: 78,
                classificationMethod: "keyword",
                matchedCategory: null,
                matchedCategories: [],
                categoryMatches: [],
                matchedTriggers: ["lead:inquiry"],
                matchConfidence: 0,
                overallConfidence: 78,
                priority: "normal",
                recommendedAction: "no_action",
                escalationReason: null,
                isLeadInquiry: true,
                complaintFallbackUsed: false,
                analyzedAt: new Date(),
                analyzedTextHash: hashText(text),
            },
            reply: { status: "unreviewed", suggestedReply: null },
        };
    }

    const abuseResult = detectAbuse(text);
    if (abuseResult.isAbuse) {
        const action = abuseResult.severity === "threat" ? "escalate_legal" : "escalate_hr";
        const { reply: suggestedReply } = buildSuggestedReply(
            text,
            [],
            { sentiment: "abuse", intensity: "severe" },
            brandName,
            guidebooks,
            playbook
        );
        return {
            analysis: {
                sentiment: "abuse",
                sentimentScore: -12,
                sentimentConfidence: 92,
                classificationMethod: "keyword",
                matchedCategory: "abuse_harassment",
                matchedCategories: ["abuse_harassment"],
                categoryMatches: [{
                    category: "abuse_harassment",
                    guidebookId: null,
                    confidence: 90,
                    triggers: abuseResult.hits.map((h) => `abuse:${h}`),
                }],
                matchedTriggers: abuseResult.hits.map((h) => `abuse:${h}`),
                matchConfidence: 90,
                overallConfidence: 92,
                priority: "critical",
                recommendedAction: action,
                escalationReason: `abuse_${abuseResult.severity || "detected"}`,
                isLeadInquiry: false,
                complaintFallbackUsed: false,
                analyzedAt: new Date(),
                analyzedTextHash: hashText(text),
            },
            reply: { status: "suggested", suggestedReply },
        };
    }

    if (!skipSpamCheck && isSpam(text)) {
        const { reply: suggestedReply } = buildSuggestedReply(
            text,
            [],
            { sentiment: "spam", intensity: "mild" },
            brandName,
            guidebooks,
            playbook
        );
        return {
            analysis: {
                sentiment: "spam",
                sentimentScore: -10,
                sentimentConfidence: 90,
                classificationMethod: "keyword",
                matchedCategory: null,
                matchedCategories: [],
                categoryMatches: [],
                matchedTriggers: [],
                matchConfidence: 0,
                overallConfidence: 90,
                priority: "high",
                recommendedAction: "hide_comment",
                escalationReason: "spam_pattern_detected",
                isLeadInquiry: false,
                complaintFallbackUsed: false,
                analyzedAt: new Date(),
                analyzedTextHash: hashText(text),
            },
            reply: { status: "suggested", suggestedReply },
        };
    }

    const sentimentResult = computeSentiment(text);
    const skipCategoryMatching = isNeutralInquiry(text) || isClearlyPositive(text) || isSoftMixedNeutral(text);
    const categoryMatches = skipCategoryMatching
        ? []
        : collectCategoryMatches(text, guidebooks, sentimentResult);
    const primaryMatch = pickPrimaryCategoryMatch(categoryMatches);
    const escalationReasons = detectEscalation(text, categoryMatches);

    const hinglishHits = sentimentResult.hinglishHits || [];
    const fuzzyHits = sentimentResult.fuzzyHits || [];

    let finalSentiment = sentimentResult.sentiment;

    if (categoryMatches.length > 0 || hinglishHits.length > 0 || fuzzyHits.length > 0) {
        const skipNegativeOverride = isClearlyPositive(text) || isNeutralInquiry(text);
        if (!skipNegativeOverride && (finalSentiment === "neutral" || finalSentiment === "positive")) {
            finalSentiment = "negative";
            sentimentResult.sentimentConfidence = Math.max(
                sentimentResult.sentimentConfidence,
                primaryMatch
                    ? Math.round(primaryMatch.matchConfidence * 0.75)
                    : fuzzyHits.length
                        ? 80
                        : 75 + Math.min(hinglishHits.length * 3, 15)
            );
        }
    }

    const priority = resolvePriority(finalSentiment, categoryMatches, escalationReasons);
    const recommendedAction = resolveRecommendedAction(categoryMatches, priority, finalSentiment);

    let classificationMethod = "nlp";
    if (fuzzyHits.length > 0) classificationMethod = "keyword";
    if (hinglishHits.length > 0) classificationMethod = "keyword";
    if (categoryMatches.length > 0 && sentimentResult.sentimentConfidence > 50) classificationMethod = "hybrid";
    else if (categoryMatches.length > 0) classificationMethod = "keyword";

    const topMatchConfidence = primaryMatch?.matchConfidence || 0;
    const overallConfidence = computeOverallConfidence(
        sentimentResult.sentimentConfidence,
        topMatchConfidence,
        {
            escalationReasons,
            categoryMatchCount: categoryMatches.length,
        }
    );

    const { reply: suggestedReply, complaintFallbackUsed } = buildSuggestedReply(
        text,
        categoryMatches,
        { ...sentimentResult, sentiment: finalSentiment },
        brandName,
        guidebooks,
        playbook
    );

    let replyStatus = "unreviewed";
    if (finalSentiment === "positive" || finalSentiment === "neutral") {
        replyStatus = "unreviewed";
    } else if (suggestedReply) {
        replyStatus = "suggested";
    }

    return {
        analysis: {
            sentiment: finalSentiment,
            sentimentScore: sentimentResult.sentimentScore,
            sentimentConfidence: sentimentResult.sentimentConfidence,
            classificationMethod,
            matchedCategory: primaryMatch?.guidebook?.category || null,
            matchedGuidebookId: primaryMatch?.guidebook?._id || null,
            matchedCategories: categoryMatches.map((match) => match.guidebook.category),
            categoryMatches: toCategoryMatchRecords(categoryMatches),
            matchedTriggers: flattenMatchedTriggers(categoryMatches, hinglishHits, fuzzyHits),
            matchConfidence: topMatchConfidence,
            overallConfidence,
            priority,
            recommendedAction,
            escalationReason: escalationReasons.length ? escalationReasons.join("; ") : null,
            isLeadInquiry: false,
            complaintFallbackUsed: Boolean(complaintFallbackUsed),
            analyzedAt: new Date(),
            analyzedTextHash: hashText(text),
        },
        reply: {
            status: replyStatus,
            suggestedReply,
        },
        _meta: {
            intensity: sentimentResult.intensity,
            escalationReasons,
            categoryMatches,
        },
    };
}

// ── Guidebook loading ──

async function loadGuidebooks(pageId) {
    const activeFilter = { isActive: { $ne: false } };

    const [globalEntries, pageEntries] = await Promise.all([
        Guidebook.find({ pageId: null, ...activeFilter }).sort({ sortOrder: 1 }).lean(),
        pageId
            ? Guidebook.find({ pageId, ...activeFilter }).sort({ sortOrder: 1 }).lean()
            : [],
    ]);

    // Page-specific entries override global ones by category
    const merged = new Map(globalEntries.map((e) => [e.category, e]));
    for (const e of pageEntries) merged.set(e.category, e);
    const loaded = [...merged.values()];

    // Safety net if DB is empty — use in-memory defaults
    if (loaded.length === 0) {
        return DEFAULT_GUIDEBOOK.map((e) => ({ ...e, isActive: true }));
    }

    return loaded;
}

async function seedDefaultGuidebook(options = {}) {
    const { force = false } = options;

    for (const entry of DEFAULT_GUIDEBOOK) {
        const filter = { pageId: null, category: entry.category };
        const payload = { ...entry, pageId: null, isActive: true };

        if (force) {
            await Guidebook.findOneAndUpdate(filter, { $set: payload }, { upsert: true, new: true });
            continue;
        }

        const existing = await Guidebook.findOne(filter).lean();
        if (!existing) {
            await Guidebook.create(payload);
        }
    }

    await Guidebook.updateMany(
        { pageId: null, isActive: { $exists: false } },
        { $set: { isActive: true } }
    );

    const count = await Guidebook.countDocuments({ pageId: null });
    console.log(`✅ Guidebook seeded: ${count} global categories${force ? " (forced reset)" : ""}`);
}

// ── Batch processing for synced comments ──

async function processCommentDocument(comment, guidebooks, brandName, brandNames = [], pageId, playbook = DEFAULT_PLAYBOOK) {
    const currentStatus = comment.reply?.status;
    const textHash = hashText(comment.text);

    // Skip page/brand's own replies — they are not customer comments
    if (isBrandAuthor(comment, brandNames.length ? brandNames : [brandName], pageId)) {
        return {
            isBrandAuthored: true,
            analysis: {
                sentiment: "neutral",
                sentimentScore: 0,
                sentimentConfidence: 95,
                classificationMethod: "keyword",
                matchedCategory: null,
                matchedTriggers: [],
                matchConfidence: 0,
                overallConfidence: 95,
                priority: "normal",
                recommendedAction: "no_action",
                escalationReason: null,
                analyzedAt: new Date(),
                analyzedTextHash: textHash,
            },
            reply: { status: "ignored", suggestedReply: null },
        };
    }

    // Don't re-process finalized review states unless the Meta comment text changed
    if (
        ["approved", "rejected", "ignored", "replied"].includes(currentStatus) &&
        comment.analysis?.analyzedTextHash === textHash
    ) {
        return null;
    }

    const result = analyzeCommentText(comment.text, guidebooks, {
        brandName: resolveBrandName(brandName, playbook),
        playbook,
    });

    // Personalise template placeholder
    let suggestedReply = result.reply.suggestedReply;
    if (suggestedReply) {
        suggestedReply = suggestedReply.replace(/\{\{username\}\}/gi, displayUsername(comment.username));
    }

    // Preserve one-time human review (approve/reject/ignore/replied) + finalReply
    const preserveStatus = ["approved", "replied", "ignored", "rejected"].includes(currentStatus);
    const replyUpdate = preserveStatus
        ? {
            status: comment.reply?.status,
            finalReply: comment.reply?.finalReply,
            reviewedBy: comment.reply?.reviewedBy,
            reviewedAt: comment.reply?.reviewedAt,
            repliedAt: comment.reply?.repliedAt,
            platformReplyId: comment.reply?.platformReplyId,
            suggestedReply: suggestedReply || comment.reply?.suggestedReply,
        }
        : {
            status: result.reply.status,
            suggestedReply,
        };

    return {
        analysis: result.analysis,
        reply: replyUpdate,
    };
}

async function processCommentsForPage(pageId, brandName, brandNames = []) {
    const names = brandNames.length ? brandNames : [brandName].filter(Boolean);
    const [guidebooks, playbook] = await Promise.all([
        loadGuidebooks(pageId),
        loadPlaybook(pageId),
    ]);
    const resolvedBrand = resolveBrandName(brandName, playbook);
    const comments = await Comment.find({ pageId }).lean();
    let processed = 0;

    const bulkOps = [];
    for (const comment of comments) {
        const update = await processCommentDocument(comment, guidebooks, resolvedBrand, names, pageId, playbook);
        if (!update) continue;

        bulkOps.push({
            updateOne: {
                filter: { _id: comment._id },
                update: { $set: update },
            },
        });
        processed++;
    }

    if (bulkOps.length) {
        await Comment.bulkWrite(bulkOps, { ordered: false });
    }

    await Page.findOneAndUpdate({ pageId }, { repliesSyncedAt: new Date() });

    console.log(`✅ Comment analysis: ${processed}/${comments.length} processed for page ${pageId}`);
    return { total: comments.length, processed };
}

async function analyzeSingleComment(commentId) {
    const comment = await Comment.findById(commentId);
    if (!comment) return null;

    const page = await require("../models/Page").findOne({ pageId: comment.pageId });
    const [guidebooks, playbook] = await Promise.all([
        loadGuidebooks(comment.pageId),
        loadPlaybook(comment.pageId),
    ]);
    const brandName = resolveBrandName(page?.name, playbook);
    const update = await processCommentDocument(
        comment.toObject(),
        guidebooks,
        brandName,
        [brandName],
        comment.pageId,
        playbook
    );

    if (update) {
        comment.analysis = update.analysis;
        comment.reply = { ...comment.reply?.toObject?.() || comment.reply, ...update.reply };
        await comment.save();
    }

    return comment;
}

module.exports = {
    analyzeCommentText,
    processCommentsForPage,
    analyzeSingleComment,
    loadGuidebooks,
    loadPlaybook,
    seedDefaultGuidebook,
    fillTemplate,
    displayUsername,
    computeOverallConfidence,
    isSpam,
};
