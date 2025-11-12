import type { TracingConfig as TracingConfigType, OperationType } from './traceTypes';
import type { INodeExecutionData } from 'n8n-workflow';
export declare class MemoryTracer {
    private config;
    private collector;
    constructor(config: TracingConfigType);
    isEnabled(): boolean;
    private generateTraceId;
    private generateTimestamp;
    private inferEndpoint;
    startOperation(type: OperationType, metadata?: any, parentTraceId?: string): string;
    completeOperation(traceId: string, result: any): void;
    getTraceOutput(): INodeExecutionData[];
    exportTracesToJaeger(endpoint: string): Promise<void>;
    initialize(_config: TracingConfig): void;
    startSpan(_name: string, _options?: SpanOptions): any;
    addEvent(_span: any, _name: string, _attributes?: Record<string, any>): void;
    addAttributes(_span: any, _attributes: Record<string, any>): void;
    endSpan(_span: any): void;
    endSpanWithError(_span: any, _error: Error): void;
}
export interface TracingConfig {
    enabled?: boolean;
    exporterType?: 'jaeger' | 'otlp-grpc' | 'otlp-http' | 'console';
    endpoint?: string;
    serviceName?: string;
    protocol?: 'http' | 'udp' | 'grpc';
}
export interface SpanOptions {
    attributes?: Record<string, string | number | boolean>;
    parentSpan?: any;
}
//# sourceMappingURL=tracer.d.ts.map