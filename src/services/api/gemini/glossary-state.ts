import { GlossaryItem } from '@/types/glossary';
import { logger } from '@/services/utils/logger';

/**
 * Non-blocking glossary state manager for parallel chunk processing.
 * Allows individual chunks to independently wait for glossary confirmation
 * without blocking other chunks in the pipeline.
 */
export class GlossaryState {
  private promise: Promise<GlossaryItem[]>;
  private resolved = false;
  private glossary: GlossaryItem[] = [];

  constructor(glossaryPromise: Promise<GlossaryItem[]>) {
    this.promise = glossaryPromise
      .then((g) => {
        this.glossary = g;
        this.resolved = true;
        logger.info('✅ GlossaryState: Glossary resolved', { termCount: g.length });
        return g;
      })
      .catch((e) => {
        logger.error('❌ GlossaryState: Glossary promise rejected', e);
        this.glossary = [];
        this.resolved = true;
        return [];
      });
  }

  /**
   * Get the glossary. Returns immediately if already resolved,
   * otherwise waits for the promise to resolve.
   */
  async get(): Promise<GlossaryItem[]> {
    if (this.resolved) {
      return this.glossary;
    }
    return this.promise;
  }

  /**
   * Check if glossary is ready (non-blocking check).
   */
  isReady(): boolean {
    return this.resolved;
  }
}
