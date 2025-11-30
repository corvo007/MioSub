/**
 * Select audio chunks based on time duration limit
 * @param chunks - Array of chunk parameters
 * @param sampleMinutes - Time limit in minutes, or 'all' for entire file
 * @param chunkDuration - Duration of each chunk in seconds
 * @returns Selected chunks to analyze
 */
export function selectChunksByDuration(
    chunks: { index: number; start: number; end: number }[],
    sampleMinutes: number | 'all',
    chunkDuration: number
): { index: number; start: number; end: number }[] {
    if (sampleMinutes === 'all') {
        return chunks;
    }

    const targetSeconds = sampleMinutes * 60;
    const chunksNeeded = Math.ceil(targetSeconds / chunkDuration);

    // If calculated chunks exceed total, return all
    if (chunksNeeded >= chunks.length) {
        return chunks;
    }

    // Return chunks from the beginning
    return chunks.slice(0, chunksNeeded);
}
