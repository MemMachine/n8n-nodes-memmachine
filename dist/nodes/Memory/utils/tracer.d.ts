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
export declare class MemoryTracer {
    private enabled;
    constructor(_config?: TracingConfig);
    initialize(_config: TracingConfig): void;
    startSpan(_name: string, _options?: SpanOptions): any;
    endSpan(_span: any): void;
    endSpanWithError(_span: any, _error: Error): void;
    recordException(_span: any, _error: Error): void;
    setSpanStatus(_span: any, _status: string): void;
    setAttribute(_span: any, _key: string, _value: string | number | boolean): void;
    setAttributes(_span: any, _attributes: Record<string, string | number | boolean>): void;
    addAttributes(_span: any, _attributes: Record<string, string | number | boolean>): void;
    addEvent(_span: any, _name: string, _attributes?: Record<string, string | number | boolean>): void;
    shutdown(): Promise<void>;
    isEnabled(): boolean;
}
export declare function withSpan<T>(tracer: MemoryTracer, name: string, operation: (span: any) => Promise<T>, options?: SpanOptions): Promise<T>;
//# sourceMappingURL=tracer.d.ts.map