/**
 * Fuzzy match for critical fraud/scam words — catches typos like "frod" → "fraud".
 * Scoped to high-priority terms only (not site-wide).
 */

const natural = require("natural");
const levenshtein = natural.DamerauLevenshteinDistance;

/** Canonical forms — stemming handles inflections; fuzzy handles typos */
const FUZZY_CRITICAL_CANONICAL = [
    "fraud",
    "fraudulent",
    "fake",
    "scam",
    "cheat",
    "cheater",
];

/**
 * Common English words that are ≤2 edits from fake/scam/fraud but are not accusations.
 * Skip fuzzy matching for these to limit false positives.
 */
const FUZZY_BLOCKLIST = new Set([
    "scan", "face", "fact", "fast", "form", "from", "feat", "fame", "fate",
    "farm", "foam", "flam", "team", "ream", "seam", "chat", "heat", "seat",
    "that", "what", "flat", "flag", "flak", "fray", "free", "fred", "feed",
    // Positive/neutral words that fuzzy-match fraud terms (e.g. great→cheat)
    "great", "greet", "green", "grate", "grant", "groan", "grew", "grow",
    "initiative", "initiatives", "good", "best", "nice", "love", "loved", "happy",
    "thanks", "thank", "please", "hello", "whatsapp", "contact", "share", "visit",
]);

function normalizeToken(token) {
    return (token || "").toLowerCase().replace(/[^a-z]/g, "");
}

function maxAllowedDistance(canonical) {
    if (canonical.length <= 4) return 1;
    return 2;
}

/**
 * @param {string} text
 * @returns {Array<{ token: string, canonical: string, distance: number }>}
 */
function detectFuzzyCriticalWords(text) {
    const tokenizer = new natural.WordTokenizer();
    const rawTokens = tokenizer.tokenize((text || "").toLowerCase()) || [];
    const hits = [];
    const seen = new Set();

    for (const raw of rawTokens) {
        const token = normalizeToken(raw);
        if (token.length < 3 || token.length > 12) continue;
        if (FUZZY_BLOCKLIST.has(token)) continue;

        for (const canonical of FUZZY_CRITICAL_CANONICAL) {
            if (token === canonical) continue;
            if (Math.abs(token.length - canonical.length) > 2) continue;

            const distance = levenshtein(token, canonical);
            if (distance > maxAllowedDistance(canonical)) continue;

            const key = `${token}:${canonical}`;
            if (seen.has(key)) continue;
            seen.add(key);

            hits.push({ token, canonical, distance });
            break;
        }
    }

    return hits;
}

module.exports = {
    FUZZY_CRITICAL_CANONICAL,
    FUZZY_BLOCKLIST,
    detectFuzzyCriticalWords,
};
