export type ResourceType = 'memory' | 'project';
export type OperationType = 'store' | 'create' | 'retrieve' | 'search' | 'enrich' | 'retrieve' | 'delete';
export type TraceStatus = 'started' | 'success' | 'failure';
export type ErrorType = 'network' | 'validation' | 'authentication' | 'timeout' | 'unexpected';
export interface TraceEntry {
    traceId: string;
    parentTraceId?: string;
    timestamp: string;
    resourceType: ResourceType;
    operationType: OperationType;
    status: TraceStatus;
    duration?: number;
    metadata: TraceMetadata;
    error?: ErrorContext;
    _truncated?: TruncationInfo;
}
export interface TraceMetadata {
    apiEndpoint: string;
    itemIndex?: number;
    memoryCount?: number;
    categoryDistribution?: Record<string, number>;
    responseSize?: number;
    queryParams?: Record<string, any>;
    searchQuery?: string;
    candidateCount?: number;
    selectedCount?: number;
    relevanceScores?: number[];
    templateUsed?: string;
    inputMemoryCount?: number;
    outputSize?: number;
    enrichmentTimeMs?: number;
    [key: string]: any;
}
export interface ErrorContext {
    type: ErrorType;
    message: string;
    code?: string;
    context?: Record<string, any>;
    stack?: string;
}
export interface TruncationInfo {
    original_size: number;
    truncated_to: number;
    timestamp: string;
    strategy?: string;
}
export interface SanitizationRule {
    name: string;
    fieldPattern?: RegExp;
    valuePattern?: RegExp;
    replacement: string;
}
export interface TraceFilter {
    traceId?: string;
    operationType?: OperationType[];
    status?: TraceStatus[];
    timeRange?: TimeRange;
}
export interface TimeRange {
    start: string;
    end: string;
}
export interface TracingConfig {
    enabled: boolean;
    format: 'json' | 'human';
    verbosity: 'minimal' | 'normal' | 'verbose';
    maxEntrySize: number;
    sanitizationRules?: SanitizationRule[];
}
export interface TruncationConfig {
    maxSize: number;
    criticalFields: string[];
    summarizeThreshold: number;
}
