export interface TracingConfig {
    enabled: boolean;
    endpoint: string;
    protocol: 'http' | 'udp' | 'grpc';
    serviceName?: string;
    batchInterval?: number;
    maxQueueSize?: number;
}
export interface SpanOptions {
    parent?: any;
    kind?: 'CLIENT' | 'SERVER' | 'PRODUCER' | 'CONSUMER' | 'INTERNAL';
    attributes?: Record<string, string | number | boolean>;
    startTime?: Date;
}
