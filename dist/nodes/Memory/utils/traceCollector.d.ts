import type { TraceEntry, TraceFilter } from './traceTypes';
export declare class TraceCollector {
    private traces;
    addTrace(entry: TraceEntry): void;
    updateTrace(traceId: string, update: {
        success?: boolean;
        metadata?: any;
        error?: any;
    }): void;
    getAllTraces(): TraceEntry[];
    filterTraces(filter: TraceFilter): TraceEntry[];
    clear(): void;
    count(): number;
}
//# sourceMappingURL=traceCollector.d.ts.map