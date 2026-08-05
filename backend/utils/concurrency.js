/**
 * Execute async tasks with max concurrency
 * Prevents rate limiting and resource exhaustion
 * 
 * @param {array} tasks - Array of async functions
 * @param {number} maxConcurrent - Max concurrent tasks (default: 5)
 * @returns {Promise<array>} Results in same order as input
 */
async function withConcurrencyLimit(tasks, maxConcurrent = 5) {
    const results = new Array(tasks.length);
    const executing = [];
    let completed = 0;

    for (let i = 0; i < tasks.length; i++) {
        // Create promise for this task
        const promise = Promise.resolve().then(() => {
            console.log(`🔄 Task ${i + 1}/${tasks.length} starting...`);
            return tasks[i]();
        }).then(
            (result) => {
                results[i] = result;
                completed++;
                console.log(`✅ Task ${i + 1}/${tasks.length} completed (${completed}/${tasks.length})`);
                return result;
            },
            (error) => {
                results[i] = Promise.reject(error);
                completed++;
                console.error(`❌ Task ${i + 1}/${tasks.length} failed:`, error.message);
                return Promise.reject(error);
            }
        );

        executing.push(promise);

        // If we've queued up maxConcurrent tasks, wait for one to finish
        if (executing.length >= maxConcurrent) {
            await Promise.race(executing);
            executing.splice(executing.findIndex(p => p === promise), 1);
        }
    }

    // Wait for remaining tasks
    await Promise.all(executing);

    return results;
}

module.exports = { withConcurrencyLimit };