/**
 * Hindi / Hinglish (Roman script) negative & scam phrases.
 * AFINN English sentiment misreads these — e.g. "help" in "help na le" scores positive.
 */

/** Multi-word phrases — checked via substring on normalized text */
const HINGLISH_NEGATIVE_PHRASES = [
    // Warnings / "don't use them"
    "help na le", "help mat lo", "help mat le", "inse help na", "inhe mat", "inko mat",
    "koi inse", "koi inhe", "koi inko", "mat lo", "mat le", "mat karo", "mat karna",
    "dur raho", "door raho", "bach ke", "bachke rehna", "trust mat", "vishwas mat",
    "believe mat", "yakeen mat", "paise mat", "money mat",

    // Loot / scam accusations
    "paise lootne", "paise loot", "lootne ka kaam", "lootne ka kam", "loot ka kaam",
    "loot ka kam", "paise loot rahe", "paise loot rhe", "loot liya", "loot liye",
    "paise le liye",     "paise kha gaye", "paise kha liye", "paise kha gye", "paise kha liye",
    "pasise kha gaye", "pasise kha liye", "pasise kha gye", "pasise kha",
    "paise kha", "kha gaye", "kha gye", "kha liye", "paise barbad", "paise waste",
    "paisa barbad", "paisa waste", "paisa loot",

    // Trust warnings (Roman Hindi)
    "trust mat", "trust mat krna", "trust mat karna", "koi bhi trust", "koi trust mat",
    "vishwas mat", "bharosa mat", "believe mat",

    // Refund / payment (Roman Hindi)
    "refund nhi", "refund nahi", "refund ni", "payment k baad", "payment ke baad",
    "help ni milegi", "help nahi milegi", "koi help ni", "koi call ni",
    "kuch nahi kiya", "kuch kiya nahi", "leke kuch nahi",

    // Phone / contact (Roman Hindi)
    "number lag nahi", "lag nahi raha", "call nahi lag", "call ni lag", "number nahi lag",
    "phone nahi lag", "connect nahi ho",
    "call bhi cut", "cut kr dete", "call cut", "number block", "block kar diya",

    // Fraud / fake (Hinglish phrasing — not bare English; those use guidebook word-boundary match)
    "dhokha", "dhokebaaz", "dhoke baaz", "farzi", "nakli", "fraud hai", "froud",
    "froud krte", "scam hai", "scam h", "bhrasht", "bhrast", "thug liya", "thug liye", "cheat kiya",
    "bewakoof bana", "bewakuf bana", "murkh mat", "andha vishwas",

    // Strong negative quality
    "bekar hai", "bekar h", "bakwas hai", "bakwas h", "ghatiya", "ghatia", "khatiya",
    "kharab hai", "kharab h", "worst hai", "pathetic hai", "useless hai",
    "time waste", "samay barbad", "pareshan kar", "tang kiya", "tang karte",

    // Devanagari (when comments use Hindi script)
    "लूट", "धोखा", "धोकेबाज", "फर्जी", "नकली", "बकवास", "बेकार", "घटिया",
    "पैसे लूट", "पैसे खा", "पैसा खा", "मत लो", "मत ले", "धोखेबाज", "वictim",
];

/** Regex patterns for flexible Hinglish grammar */
const HINGLISH_NEGATIVE_PATTERNS = [
    /\bpasise\s+kha\s+(gye|gaye|liye|liya)\b/i,
    /\bpais[ae]?\s*kha\s+(gye|gaye|liye|liya)\b/i,
    /\bkha\s+(gye|gaye|liye|liya)\b/i,
    /\btrust\s+mat\b/i,
    /\bfroud\b/i,
    /\brefund\s+(nhi|nahi|ni)\b/i,
    /\bhelp\s+(ni|nahi)\s+milegi\b/i,
    /\bkoi\s+(bhi\s+)?trust\s+mat\b/i,
    /\bnumber\s+lag\s+nahi\b/i,
    /\blag\s+nahi\s+raha\b/i,
    /\bcall\s+(nahi|ni)\s+lag\b/i,
    /\bcall\s+bhi\s+cut/i,
    /\bcut\s+kr\s+dete/i,
    /\bkuch\s+nahi\s+kiya/i,
    /\bleke\s+kuch\s+nahi/i,
    /\bnumber\s+block/i,
    /\bblock\s+kar\s+diya/i,
    /\bloot(ne|a|te|ti|ing)?\b/i,
    /\bpaise?\s+loot/i,
    /\bdhoke?ba?az/i,
    /\bfarzi\b/i,
    /\bnakli\b/i,
    /\bbakwas\b/i,
    /\bbekar\b/i,
    /\bghatiy/i,
    /\bkharab\b/i,
    /\bmat\s+(lo|le|karo|karna|dena|do)\b/i,
    /\bna\s+(lo|le|karo|karna)\b/i,
    /\bchor\b/i,
];

/** English words that AFINN scores positive but are negated in Hinglish context */
const FALSE_POSITIVE_CONTEXTS = [
    /\bhelp\s+(na|mat)\b/i,
    /\bhelp\s+\w+\s+(na|mat)\b/i,
];

function normalize(text) {
    return (text || "").toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Detect Hindi/Hinglish negative sentiment AFINN misses.
 * @returns {{ hits: string[], scoreAdjustment: number, forceNegative: boolean }}
 */
function analyzeHinglishSentiment(text) {
    const norm = normalize(text);
    if (!norm) return { hits: [], scoreAdjustment: 0, forceNegative: false };

    const hits = new Set();

    for (const phrase of HINGLISH_NEGATIVE_PHRASES) {
        if (norm.includes(phrase)) hits.add(phrase);
    }

    for (const pattern of HINGLISH_NEGATIVE_PATTERNS) {
        const m = norm.match(pattern);
        if (m) hits.add(m[0]);
    }

    const hitList = [...hits];
    if (hitList.length === 0) {
        return { hits: [], scoreAdjustment: 0, forceNegative: false };
    }

    let scoreAdjustment = 0;
    for (const hit of hitList) {
        const h = hit.toLowerCase();
        if (/loot|dhok|farzi|nakli|chor|cheat kiya|fraud hai|scam hai/.test(h)) {
            scoreAdjustment -= 10;
        } else if (/help\s+(na|mat)|mat\s+(lo|le|karo)|paise/.test(h)) {
            scoreAdjustment -= 8;
        } else {
            scoreAdjustment -= 5;
        }
    }

    // Cap total adjustment
    scoreAdjustment = Math.max(scoreAdjustment, -25);

    const forceNegative = hitList.length >= 1 && scoreAdjustment <= -5;

    return { hits: hitList, scoreAdjustment, forceNegative };
}

function hasFalsePositiveEnglishContext(text) {
    const norm = normalize(text);
    return FALSE_POSITIVE_CONTEXTS.some((p) => p.test(norm));
}

module.exports = {
    HINGLISH_NEGATIVE_PHRASES,
    HINGLISH_NEGATIVE_PATTERNS,
    analyzeHinglishSentiment,
    hasFalsePositiveEnglishContext,
};
