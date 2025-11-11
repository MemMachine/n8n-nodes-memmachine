import type { IDataObject } from 'n8n-workflow';

export interface EpisodicMemoryItem extends IDataObject {
  episode_content: string;
  producer: string;
  produced_for: string;
  episode_type: 'dialog' | 'summary' | 'observation';
  timestamp?: string;
  metadata?: IDataObject;
}

export interface CategorizedMemories {
  history: EpisodicMemoryItem[];
  shortTermMemory: EpisodicMemoryItem[];
  longTermMemory: EpisodicMemoryItem[];
}

/**
 * Categorizes episodic memories into temporal arrays based on recency
 * 
 * @param episodicMemories - Array of memories from MemMachine API (assumed pre-sorted by relevance)
 * @param historyCount - Number of most recent items for history array (default: 5)
 * @param shortTermCount - Number of items for short-term memory array (default: 10)
 * @returns Categorized memory structure with three arrays
 * 
 * @example
 * const memories = [mem1, mem2, mem3, ..., mem20];
 * const categorized = categorizeMemories(memories, 5, 10);
 * // Result: { history: [mem1...mem5], shortTermMemory: [mem6...mem15], longTermMemory: [mem16...mem20] }
 */
export function categorizeMemories(
  episodicMemories: EpisodicMemoryItem[],
  historyCount: number = 5,
  shortTermCount: number = 10,
): CategorizedMemories {
  const history = episodicMemories.slice(0, historyCount);
  const shortTermMemory = episodicMemories.slice(historyCount, historyCount + shortTermCount);
  const longTermMemory = episodicMemories.slice(historyCount + shortTermCount);

  return {
    history,
    shortTermMemory,
    longTermMemory,
  };
}
