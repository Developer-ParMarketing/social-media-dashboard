/**
 * Maps Hinglish / Roman Hindi phrases to clean English issue labels for public replies.
 * Used internally — customers see professional English, not raw Roman Hindi in {{issue}}.
 */

function normalize(text) {
    return (text || "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** Longest-match-first phrase → English label */
const PHRASE_LABELS = [
    { pattern: /pasise\s+kha|pais[ae]\s+kha\s+(gye|gaye|liye)|paisa\s+kha/i, label: "your payment being taken" },
    { pattern: /kha\s+(gye|gaye|liye|liya)/i, label: "your payment or refund issue" },
    { pattern: /paise?\s+(loot|barbad|waste)/i, label: "your payment issue" },
    { pattern: /refund\s+(nhi|nahi|ni)/i, label: "your refund request" },
    { pattern: /not resolved|unresolved|not resolve/i, label: "your unresolved service issue" },
    { pattern: /don't use|do not use|mat\s+(lo|le|karo)/i, label: "your warning to others about our service" },
    { pattern: /help\s+(na|mat|ni|nahi)/i, label: "not receiving the help you expected" },
    { pattern: /trust\s+mat|vishwas\s+mat|bharosa\s+mat/i, label: "your trust issue" },
    { pattern: /loot|dhok|farzi|nakli|scam|fraud|froud/i, label: "your fraud or scam allegation" },
    { pattern: /call\s+bhi\s+cut|cut\s+kr\s+dete|call\s+cut|cut\s+kar\s+dete/i, label: "calls being disconnected" },
    { pattern: /leke\s+kuch\s+nahi|kuch\s+nahi\s+kiya|kuch\s+nahi\s+hai/i, label: "payment taken without service delivered" },
    { pattern: /\d{3,}\s*(leke|liya|liye|l(?:iya|iye))/i, label: "your payment issue" },
    { pattern: /mera\s+\d+/i, label: "your payment issue" },
    { pattern: /number\s+block|block\s+kar\s+diya|number\s+bhi\s+block/i, label: "your number being blocked" },
    { pattern: /bekar|bakwas|ghatiy|kharab/i, label: "your dissatisfaction with our service" },
    { pattern: /payment\s+k\s?baad|payment\s+ke\s+baad/i, label: "issues after making a payment" },
    // Devanagari
    { pattern: /पैस[ेे]|लूट|धोख|फर्जी|बकवास|बेकार|मत\s+ल/i, label: "your payment or service issue" },
];

/**
 * @returns {string|null} English issue label or null
 */
function resolveHinglishIssueLabel(text) {
    const norm = normalize(text);
    if (!norm) return null;

    for (const { pattern, label } of PHRASE_LABELS) {
        if (pattern.test(norm)) return label;
    }
    return null;
}

/** True when comment is primarily Roman Hindi / Devanagari (not plain English) */
function isHinglishDominant(text) {
    const norm = normalize(text);
    if (!norm) return false;
    if (/[\u0900-\u097F]/.test(text)) return true;
    const hinglishMarkers = /\b(paise|paisa|pasise|kha gaye|mat lo|mat le|dhok|loot|bekar|bakwas|nahi|nhi|milegi|lag raha|bhi|dete|kuch|mera|meri|kiya|kar diya|block kar|leke|cut kr|cut kar)\b/i;
    return hinglishMarkers.test(norm);
}

module.exports = {
    resolveHinglishIssueLabel,
    isHinglishDominant,
    PHRASE_LABELS,
};
