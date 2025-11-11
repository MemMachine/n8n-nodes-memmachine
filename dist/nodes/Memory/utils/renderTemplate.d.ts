import type { IDataObject } from 'n8n-workflow';
import type { CategorizedMemories, EpisodicMemoryItem } from './categorizeMemories';
export interface ProfileMemoryFacts extends IDataObject {
    facts?: Array<{
        subject: string;
        predicate: string;
        object: string;
        confidence?: number;
        source?: string;
    }>;
    entities?: Record<string, string>;
}
export declare function renderTemplate(template: string, categorized: CategorizedMemories, profileMemory: ProfileMemoryFacts): string;
export declare function formatAsMarkdownList(items: EpisodicMemoryItem[]): string;
export declare function formatProfileMemory(profileMemory: ProfileMemoryFacts): string;
//# sourceMappingURL=renderTemplate.d.ts.map