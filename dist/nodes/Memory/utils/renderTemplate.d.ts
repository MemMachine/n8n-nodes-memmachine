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
export interface SemanticMemoryFeature extends IDataObject {
    set_id: string;
    category: string;
    tag: string;
    feature_name: string;
    value: string;
    metadata?: {
        citations?: any;
        id?: string;
        other?: any;
    };
}
export declare function renderTemplate(template: string, categorized: CategorizedMemories, profileMemory: ProfileMemoryFacts, semanticMemory?: SemanticMemoryFeature[], episodeSummary?: string[]): string;
export declare function formatAsMarkdownList(items: EpisodicMemoryItem[]): string;
export declare function formatProfileMemory(profileMemory: ProfileMemoryFacts): string;
export declare function formatSemanticMemory(semanticMemory: SemanticMemoryFeature[]): string;
export declare function formatEpisodeSummary(episodeSummary: string[]): string;
//# sourceMappingURL=renderTemplate.d.ts.map