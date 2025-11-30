export async function mapInParallel<T, R>(
    items: T[],
    concurrency: number,
    fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let currentIndex = 0;

    const worker = async () => {
        while (currentIndex < items.length) {
            const i = currentIndex++;
            if (i >= items.length) break;

            try {
                results[i] = await fn(items[i], i);
            } catch (e) {
                throw e;
            }
        }
    };

    const workers = Array(Math.min(items.length, concurrency))
        .fill(null)
        .map(() => worker());

    await Promise.all(workers);
    return results;
}
