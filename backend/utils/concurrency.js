/**
 * Execute async tasks with max concurrency
 * Prevents rate limiting and resource exhaustion
 * 
 * @param {array} tasks - Array of async functions
 * @param {number} maxConcurrent - Max concurrent tasks (default: 5)
 * @returns {Promise<array>} Results in same order as input
 */
async function withConcurrencyLimit(tasks, maxConcurrent = 5) {
    const results = [];
    let nextIndex = 0;

    async function worker() {
        while (nextIndex < tasks.length) {
            const i = nextIndex++;
            try {
                const value = await tasks[i]();
                if (value != null) results.push(value);
            } catch (err) {
                console.error(`❌ Task ${i + 1}/${tasks.length} failed:`, err.message);
            }
        }
    }

    const workerCount = Math.min(maxConcurrent, tasks.length);
    await Promise.all(Array.from({ length: workerCount }, worker));

    return results;
}

module.exports = { withConcurrencyLimit };