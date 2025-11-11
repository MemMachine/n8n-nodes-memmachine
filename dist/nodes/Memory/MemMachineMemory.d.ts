import { BaseChatMemory } from '@langchain/community/memory/chat_memory';
import type { InputValues, MemoryVariables } from '@langchain/core/memory';
import { MemoryTracer } from './utils/tracer';
export interface MemMachineMemoryConfig {
    apiUrl: string;
    apiKey?: string;
    groupId: string;
    agentId: string[];
    userId: string[];
    sessionId: string;
    contextWindowLength?: number;
    enableTemplate?: boolean;
    contextTemplate?: string;
    historyCount?: number;
    shortTermCount?: number;
    logger?: {
        info: (message: string, ...args: any[]) => void;
        error: (message: string, ...args: any[]) => void;
        warn: (message: string, ...args: any[]) => void;
    };
    tracer?: MemoryTracer;
}
export declare class MemMachineMemory extends BaseChatMemory {
    private config;
    constructor(config: MemMachineMemoryConfig);
    get memoryKeys(): string[];
    loadMemoryVariables(_values: InputValues): Promise<MemoryVariables>;
    saveContext(inputValues: InputValues, outputValues: InputValues): Promise<void>;
    private storeMessage;
    private formatTemplatedMemory;
}
//# sourceMappingURL=MemMachineMemory.d.ts.map