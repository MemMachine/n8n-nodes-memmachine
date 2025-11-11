import type { TracingConfig, SpanOptions } from './tracingConfig';
export declare class MemoryTracer {
    private provider;
    private tracer;
    private config;
    initialize(config: TracingConfig): void;
    private createExporter;
    private normalizeOTLPEndpoint;
    private normalizeGRPCEndpoint;
    isEnabled(): boolean;
    startSpan(name: string, options?: SpanOptions): any;
    endSpan(span: any): void;
    endSpanWithError(span: any, error: Error | string): void;
    addAttributes(span: any, attributes: Record<string, string | number | boolean>): void;
    addEvent(span: any, name: string, attributes?: Record<string, string | number | boolean>): void;
    createChildSpan(parent: any, name: string, options?: Omit<SpanOptions, 'parent'>): any;
    extractContext(metadata: any): any;
    injectContext(span: any): any;
    flush(): Promise<void>;
    shutdown(): Promise<void>;
}
export declare function withSpan<T>(tracer: MemoryTracer, name: string, operation: (span: any) => Promise<T>, options?: SpanOptions): Promise<T>;
export { TracingConfig, SpanOptions } from './tracingConfig';
export { SAFE_SPAN_ATTRIBUTES, SensitiveDataSpanProcessor } from './spanProcessor';
//# sourceMappingURL=tracer.d.ts.map