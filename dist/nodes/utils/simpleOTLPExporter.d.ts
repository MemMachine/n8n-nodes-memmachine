interface ExportResult {
    code: number;
}
interface ReadableSpan {
    name: string;
    spanContext(): any;
    startTime: [number, number];
    endTime: [number, number];
    attributes: Record<string, any>;
    events: any[];
    status: {
        code: number;
    };
    kind: number;
    resource: any;
    instrumentationLibrary: any;
    parentSpanId?: string;
    links: any[];
    duration: [number, number];
}
export declare class SimpleOTLPHTTPExporter {
    private url;
    private headers;
    constructor(config: {
        url: string;
    });
    export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): Promise<void>;
    shutdown(): Promise<void>;
    private serializeSpans;
    private serializeSpan;
    private serializeAttributes;
    private serializeValue;
    private hrTimeToNanos;
}
export {};
