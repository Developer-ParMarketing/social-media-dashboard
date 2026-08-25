const natural = require("natural");

function normalize(text) {
    return (text || "").toLowerCase().replace(/\s+/g, " ").trim();
}

/** 0–1 similarity between comment and a guidebook example */
function exampleSimilarity(commentText, exampleText) {
    const a = normalize(commentText);
    const b = normalize(exampleText);
    if (!a || !b) return 0;
    if (a === b) return 1;

    const shorter = a.length <= b.length ? a : b;
    const longer = a.length > b.length ? a : b;
    if (longer.includes(shorter) && shorter.length >= Math.min(18, longer.length * 0.55)) {
        return 0.92 + (shorter.length / longer.length) * 0.07;
    }

    const jw = natural.JaroWinklerDistance(a, b, { ignoreCase: true });

    const wordsA = new Set(a.split(/\s+/).filter((w) => w.length > 3));
    const wordsB = new Set(b.split(/\s+/).filter((w) => w.length > 3));
    let inter = 0;
    for (const w of wordsA) {
        if (wordsB.has(w)) inter += 1;
    }
    const union = wordsA.size + wordsB.size - inter || 1;
    const jaccard = inter / union;

    // Require strong overlap — avoids "worst service" matching unrelated examples
    if (jw < 0.9 && inter < 2) {
        return Math.max(jw, jaccard) * 0.55;
    }

    return Math.max(jw, jaccard * 0.95);
}

const EXAMPLE_MATCH_THRESHOLD = 0.84;

/**
 * Match comment against guidebook exampleComments.
 * @returns {Array<{ guidebook, matchedTriggers, matchConfidence }>}
 */
function matchGuidebookFromExamples(text, guidebooks) {
    if (!text?.trim() || !guidebooks?.length) return [];

    const matches = [];

    for (const entry of guidebooks) {
        if (entry.isActive === false) continue;
        const examples = entry.exampleComments || [];
        if (!examples.length) continue;

        let bestSim = 0;
        let bestExample = null;

        for (const example of examples) {
            const sim = exampleSimilarity(text, example);
            if (sim > bestSim) {
                bestSim = sim;
                bestExample = example;
            }
        }

        if (bestSim < EXAMPLE_MATCH_THRESHOLD || !bestExample) continue;

        const preview = bestExample.length > 48 ? `${bestExample.slice(0, 48)}…` : bestExample;
        matches.push({
            guidebook: entry,
            matchedTriggers: [`example:${preview}`],
            matchConfidence: Math.min(82, Math.round(55 + bestSim * 28)),
        });
    }

    return matches;
}

module.exports = {
    exampleSimilarity,
    matchGuidebookFromExamples,
    EXAMPLE_MATCH_THRESHOLD,
};
