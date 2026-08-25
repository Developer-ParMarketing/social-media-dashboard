/**
 * Abuse / harassment detection — separate from spam (promo junk) and negative (CS complaints).
 * Abuse → internal review / hide; no customer-service reply template.
 */

function normalize(text) {
    return (text || "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Masked profanity: f***, f*ck, sh*t, etc. */
const MASKED_PROFANITY = [
    /\bf[\W_*]{1,4}k\b/i,
    /\bf[\W_*]{2,}\b/i,
    /\bs[\W_*]{1,3}t\b/i,
    /\ba[\W_*]{1,3}s[\W_*]{0,3}h[\W_*]{0,3}o[\W_*]{0,3}l[\W_*]{0,3}e?\b/i,
    /\bb[\W_*]{1,3}t[\W_*]{0,3}ch\b/i,
];

const EXPLICIT_PROFANITY = [
    /\bfuck(?:ing|ed|er|s)?\b/i,
    /\bshit(?:ty|s)?\b/i,
    /\basshole?s?\b/i,
    /\bbitch(?:es)?\b/i,
    /\bbastard?s?\b/i,
    /\bcunt?s?\b/i,
    /\bdick(?:head|s)?\b/i,
    /\bwtf\b/i,
    /\bstfu\b/i,
];

/** Personal attacks / harassment directed at the brand or staff */
const HARASSMENT_PATTERNS = [
    /\bf+\s*off\b/i,
    /\bf[\W_*]+\s*off\b/i,
    /\bgo\s+die\b/i,
    /\bkill\s+yourself\b/i,
    /\bkys\b/i,
    /\byou\s+people\s+are\s+(idiots?|stupid|morons?|useless|pathetic|garbage|trash)\b/i,
    /\byou\s+(are\s+)?(idiots?|stupid|morons?|useless|pathetic)\b/i,
    /\byour\s+(team|staff|company)\s+(is\s+)?(idiots?|stupid|useless|pathetic|garbage|trash)\b/i,
    /\b(idots?|idiots?|morons?|retards?|retarded)\b/i,
    /\bshut\s+up\b/i,
    /\bget\s+lost\b/i,
    /\bgo\s+to\s+hell\b/i,
    /\b(i\s+)?hate\s+you\b/i,
    /\bdumb\s+(ass|asses|people|company)\b/i,
];

const THREAT_PATTERNS = [
    /\bi\s+will\s+(kill|hurt|destroy|sue)\b/i,
    /\bwe\s+will\s+(destroy|ruin)\s+you\b/i,
    /\b(burn|bomb)\s+(it|this|you)\b/i,
];

/**
 * @returns {{ isAbuse: boolean, hits: string[], severity: 'threat'|'harassment'|'profanity'|null }}
 */
function detectAbuse(text) {
    const norm = normalize(text);
    if (!norm) return { isAbuse: false, hits: [], severity: null };

    const hits = new Set();
    let severity = null;

    const rank = (next) => {
        const order = { threat: 3, harassment: 2, profanity: 1 };
        if (!severity || order[next] > order[severity]) severity = next;
    };

    for (const p of THREAT_PATTERNS) {
        const m = norm.match(p);
        if (m) {
            hits.add(m[0]);
            rank("threat");
        }
    }

    for (const p of HARASSMENT_PATTERNS) {
        const m = norm.match(p);
        if (m) {
            hits.add(m[0]);
            rank("harassment");
        }
    }

    for (const p of [...EXPLICIT_PROFANITY, ...MASKED_PROFANITY]) {
        const m = norm.match(p);
        if (m) {
            hits.add(m[0]);
            rank("profanity");
        }
    }

    const hitList = [...hits];
    return {
        isAbuse: hitList.length > 0,
        hits: hitList,
        severity,
    };
}

module.exports = { detectAbuse };
