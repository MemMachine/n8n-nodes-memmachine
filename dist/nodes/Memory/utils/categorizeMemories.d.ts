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
export declare function categorizeMemories(episodicMemories: EpisodicMemoryItem[], historyCount?: number, shortTermCount?: number): CategorizedMemories;
//# sourceMappingURL=categorizeMemories.d.ts.map