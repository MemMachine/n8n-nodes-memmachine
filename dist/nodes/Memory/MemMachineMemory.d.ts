import { MemoryTracer } from './utils/tracer';
type InputValues = Record<string, any>;
type MemoryVariables = Record<string, any>;
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
    cloudTracer?: MemoryTracer;
    parentTraceId?: string;
    exportToJaeger?: boolean;
    jaegerEndpoint?: string;
}
export declare class MemMachineMemory {
    private config;
    returnMessages: boolean;
    inputKey: string;
    outputKey: string;
    constructor(config: MemMachineMemoryConfig);
    get memoryKeys(): string[];
    loadMemoryVariables(_values: InputValues): Promise<MemoryVariables>;
    saveContext(inputValues: InputValues, outputValues: InputValues): Promise<void>;
    private storeMessage;
    private formatTemplatedMemory;
}
export {};
//# sourceMappingURL=MemMachineMemory.d.ts.map