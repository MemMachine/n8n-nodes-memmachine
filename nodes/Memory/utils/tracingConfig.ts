/**
 * Tracing Configuration Types
 * 
 * Type definitions for OpenTelemetry tracing configuration.
 */

/**
 * Tracing configuration from node parameters
 */
export interface TracingConfig {
	/** Whether tracing is enabled */
	enabled: boolean;

	/** Jaeger endpoint URL */
	endpoint: string;

	/** Protocol for sending traces */
	protocol: 'http' | 'udp' | 'grpc';

	/** Optional service name override (default: "n8n-memory-node") */
	serviceName?: string;

	/** Optional batch export interval in milliseconds (default: 5000) */
	batchInterval?: number;

	/** Optional max queue size for batching (default: 2048) */
	maxQueueSize?: number;
}

/**
 * Span creation options
 */
export interface SpanOptions {
	/** Parent span or context for hierarchical traces */
	parent?: any; // Will be Span | Context from @opentelemetry/api

	/** Span kind (default: INTERNAL) */
	kind?: 'CLIENT' | 'SERVER' | 'PRODUCER' | 'CONSUMER' | 'INTERNAL';

	/** Initial span attributes */
	attributes?: Record<string, string | number | boolean>;

	/** Start time override (default: now) */
	startTime?: Date;
}
