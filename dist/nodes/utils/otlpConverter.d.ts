import type { TraceEntry } from './traceTypes';
export declare function convertToOTLP(traces: TraceEntry[]): any;
export declare function exportToJaeger(traces: TraceEntry[], endpoint: string): Promise<void>;
