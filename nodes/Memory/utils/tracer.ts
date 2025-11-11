/**
 * Memory Tracer Utility
 * 
 * OpenTelemetry tracer wrapper for the Memory node.
 * Provides simple API for creating and managing spans with automatic sanitization.
 * 
 * Note: OpenTelemetry dependencies are optional. If not available, tracing is gracefully disabled.
 */

import type { TracingConfig, SpanOptions } from './tracingConfig';
import { SensitiveDataSpanProcessor } from './spanProcessor';

// Dynamic imports for optional OpenTelemetry dependencies
let otelApi: any;
let NodeTracerProvider: any;
let JaegerExporter: any;
let OTLPTraceExporterGRPC: any;
let Resource: any;
let W3CTraceContextPropagator: any;
let BatchSpanProcessor: any;

// Helper function to require modules (prioritize host n8n modules to avoid version conflicts)
function requireFromRoot(moduleName: string) {
	const path = require('path');
	const fs = require('fs');
	
	// Try multiple locations in order
	const searchPaths: (string | null)[] = [
		// 1. Our bundled modules (in dist, for exporters not in n8n)
		path.join(__dirname, '../../..', 'node_modules'),
		// 2. n8n's standard modules
		'/usr/local/lib/node_modules/n8n/node_modules',
		// 3. Standard Node.js resolution (dev environment)
		null,
	];
	
	// 4. For n8n's pnpm structure, try to find the module dynamically
	const pnpmBase = '/usr/local/lib/node_modules/n8n/node_modules/.pnpm';
	if (fs.existsSync(pnpmBase)) {
		try {
			const pnpmPrefix = moduleName.replace('/', '+');
			const dirs = fs.readdirSync(pnpmBase);
			for (const dir of dirs) {
				if (dir.startsWith(pnpmPrefix + '@')) {
					const fullPath = path.join(pnpmBase, dir, 'node_modules', moduleName);
					if (fs.existsSync(fullPath)) {
						searchPaths.splice(1, 0, fullPath); // Insert after our bundled modules
						break;
					}
				}
			}
		} catch (e) {
			// Ignore pnpm search errors
		}
	}
	
	const errors: string[] = [];
	for (const searchPath of searchPaths) {
		try {
			if (searchPath === null) {
				// Try standard resolution
				return require(moduleName);
			} else {
				// Try specific path - append module name to search path
				const fullPath = path.join(searchPath, moduleName);
				return require(fullPath);
			}
		} catch (error) {
			const errMsg = error instanceof Error ? error.message : String(error);
			errors.push(`${searchPath || 'standard'}: ${errMsg}`);
			// Continue to next path
			continue;
		}
	}
	
	// All paths failed
	console.error(`[MemoryTracer] Failed to load ${moduleName}. Tried paths:`, errors);
	throw new Error(`Cannot find module '${moduleName}'. Searched: bundled, n8n pnpm, n8n standard, Node resolution.`);
}

try {
	otelApi = requireFromRoot('@opentelemetry/api');
	const sdkTraceBase = requireFromRoot('@opentelemetry/sdk-trace-base');
	NodeTracerProvider = sdkTraceBase.BasicTracerProvider;
	BatchSpanProcessor = sdkTraceBase.BatchSpanProcessor;
	const resourcesModule = requireFromRoot('@opentelemetry/resources');
	Resource = resourcesModule.Resource;
	const coreModule = requireFromRoot('@opentelemetry/core');
	W3CTraceContextPropagator = coreModule.W3CTraceContextPropagator;
	
	// Load exporters (these may be bundled if not in n8n)
	try {
		const jaegerModule = requireFromRoot('@opentelemetry/exporter-jaeger');
		JaegerExporter = jaegerModule.JaegerExporter;
	} catch (e) {
		console.warn('[MemoryTracer] Jaeger exporter not available');
	}
	
	// OTLP HTTP exporter is loaded dynamically in createExporter() to avoid loading issues
	
	try {
		const otlpGrpcModule = requireFromRoot('@opentelemetry/exporter-trace-otlp-grpc');
		OTLPTraceExporterGRPC = otlpGrpcModule.OTLPTraceExporter;
	} catch (e) {
		console.warn('[MemoryTracer] OTLP gRPC exporter not available');
	}
	
	console.log('[MemoryTracer] OpenTelemetry dependencies loaded successfully');
} catch (error) {
	console.warn('[MemoryTracer] OpenTelemetry dependencies not available. Tracing will be disabled.', error);
}

/**
 * Main tracer class implementing IMemoryTracer interface
 * 
 * Implementation follows proven patterns from test/main.go:
 * - OTLP HTTP: Uses standard /v1/traces endpoint (port 4318)
 * - OTLP gRPC: Uses host:port format without http:// (port 4317)
 * - Jaeger UDP: Legacy Thrift protocol (port 6831)
 * - BatchSpanProcessor: Configured for 500ms export interval
 * - Resource: Includes service.name and deployment.environment
 * - Explicit shutdown: Ensures all spans are flushed before exit
 */
export class MemoryTracer {
	private provider: any;
	private tracer: any;
	private config: TracingConfig | undefined;

	/**
	 * Initialize the tracer with configuration
	 */
	initialize(config: TracingConfig): void {
		if (!config.enabled) {
			this.config = config;
			return;
		}

		// Check if OpenTelemetry is available
		if (!otelApi || !NodeTracerProvider) {
			console.warn('OpenTelemetry not available, tracing disabled');
			this.config = { ...config, enabled: false };
			return;
		}

		try {
			this.config = config;
			console.log(`[MemoryTracer] Initializing tracing with endpoint: ${config.endpoint}, protocol: ${config.protocol}`);

			// Create exporter based on protocol
			console.log('[MemoryTracer] Step 1: Creating exporter...');
			const exporter = this.createExporter(config);
			console.log('[MemoryTracer] Step 1: ✓ Exporter created');

			// Create resource with service name and attributes
			// Follows Go pattern: resource.NewWithAttributes(semconv.ServiceName(...), attribute.String(...))
			console.log('[MemoryTracer] Step 2: Creating resource...');
			console.log('[MemoryTracer] DEBUG: About to call new Resource(), type:', typeof Resource);
			
			const resource = new Resource({
				'service.name': config.serviceName || 'n8n-memory-node',
				'service.version': '1.0.0',
				'deployment.environment': process.env.NODE_ENV || 'development',
				'telemetry.sdk.name': 'opentelemetry',
				'telemetry.sdk.language': 'nodejs',
				'telemetry.sdk.version': '1.x',
				// Add protocol info for easier filtering in Jaeger
				'tracing.protocol': config.protocol,
			});
			console.log('[MemoryTracer] Step 2: ✓ Resource created with service:', config.serviceName || 'n8n-memory-node');

		// Create batch span processor with aggressive settings for immediate export
		console.log('[MemoryTracer] Step 3: Creating BatchSpanProcessor...');
		const spanProcessor = new BatchSpanProcessor(exporter, {
			maxQueueSize: 100,
			maxExportBatchSize: 10,
			scheduledDelayMillis: 500,  // Export every 500ms (default is 5000ms)
			exportTimeoutMillis: 30000,
		});
		console.log('[MemoryTracer] Step 3: ✓ BatchSpanProcessor created');

		// Create TracerProvider with resource and span processor
		console.log('[MemoryTracer] Step 4: Creating NodeTracerProvider...');
		this.provider = new NodeTracerProvider({
			resource,
		});
		this.provider.addSpanProcessor(spanProcessor);
		this.provider.addSpanProcessor(new SensitiveDataSpanProcessor());
		console.log('[MemoryTracer] Step 4: ✓ NodeTracerProvider created');

		// Register the provider
		console.log('[MemoryTracer] Step 5: Registering provider...');
		this.provider.register({
			propagator: new W3CTraceContextPropagator(),
		});
		console.log('[MemoryTracer] Step 5: ✓ Provider registered');

			// Get tracer instance
			console.log('[MemoryTracer] Step 6: Getting tracer instance...');
			this.tracer = this.provider.getTracer('n8n-memory-node', '1.0.0');
			console.log('[MemoryTracer] Step 6: ✓ Tracer instance obtained');
			console.log('[MemoryTracer] ✓✓✓ Tracing fully initialized and ready ✓✓✓');
		} catch (error) {
			console.error('[MemoryTracer] ✗✗✗ Failed to initialize tracing:', error);
			console.error('[MemoryTracer] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
			this.tracer = undefined;
		}
	}

	/**
	 * Creates appropriate exporter based on the protocol.
	 * Follows patterns from working Go implementation in test/main.go
	 */
	private createExporter(config: TracingConfig): any {
		console.log('[MemoryTracer] createExporter called with protocol:', config.protocol, 'endpoint:', config.endpoint);
		
		switch (config.protocol) {
			case 'http':
				// OTLP HTTP exporter - follows Go's otlptracehttp pattern
				// Use simple HTTP exporter to avoid bundling complex dependencies
				const { SimpleOTLPHTTPExporter } = require('./simpleOTLPExporter');
				let otlpEndpoint = this.normalizeOTLPEndpoint(config.endpoint);
				
				console.log('[MemoryTracer] Final OTLP HTTP endpoint:', otlpEndpoint);
				console.log('[MemoryTracer] Creating SimpleOTLPHTTPExporter...');
				
				const exporter = new SimpleOTLPHTTPExporter({
					url: otlpEndpoint,
				});
				
				console.log('[MemoryTracer] ✅ OTLP HTTP exporter created successfully');
				return exporter;
			
			case 'udp':
				// Legacy Jaeger UDP using Thrift protocol on port 6831
				// Follows Go's runJaegerThriftUDP pattern with LocalAgentHostPort
				console.log('[MemoryTracer] Using legacy Jaeger UDP exporter (Thrift over UDP)');
				const udpHost = config.endpoint.replace(/^(https?:\/\/)?/, '').split(':')[0];
				const udpPort = parseInt(config.endpoint.split(':')[1]) || 6831;
				console.log('[MemoryTracer] Jaeger UDP target:', udpHost, ':', udpPort);
				
				return new JaegerExporter({
					host: udpHost,
					port: udpPort,
					maxPacketSize: 65000,
				});
			
			case 'grpc':
				// OTLP gRPC exporter - follows Go's otlptracegrpc pattern
				// Similar to: otlptracegrpc.NewClient(otlptracegrpc.WithEndpoint(...), otlptracegrpc.WithInsecure())
				if (!OTLPTraceExporterGRPC) {
					throw new Error('OTLP gRPC exporter not available');
				}
				console.log('[MemoryTracer] Using OTLP gRPC exporter');
				const grpcEndpoint = this.normalizeGRPCEndpoint(config.endpoint);
				console.log('[MemoryTracer] OTLP gRPC endpoint:', grpcEndpoint);
				
				return new OTLPTraceExporterGRPC({
					url: grpcEndpoint,
				});
			
			default:
				throw new Error(`Unsupported protocol: ${config.protocol}. Supported: http, udp, grpc`);
		}
	}

	/**
	 * Normalize OTLP HTTP endpoint - follows Go's endpointHostPort() helper
	 * Converts various formats to proper OTLP HTTP URL
	 */
	private normalizeOTLPEndpoint(endpoint: string): string {
		// Strip http:// or https:// prefix if present
		let normalized = endpoint;
		
		// Convert legacy Jaeger HTTP port (14268) to OTLP HTTP port (4318)
		if (endpoint.includes(':14268')) {
			normalized = endpoint.replace(':14268/api/traces', ':4318/v1/traces')
			                    .replace(':14268', ':4318');
			console.log('[MemoryTracer] Converted legacy Jaeger port:', endpoint, '→', normalized);
		}
		
		// Ensure /v1/traces path is present (OTLP HTTP standard path)
		if (!normalized.includes('/v1/traces')) {
			// Remove trailing slash if present
			normalized = normalized.replace(/\/$/, '') + '/v1/traces';
		}
		
		// Ensure http:// prefix (default to http for internal services)
		if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
			normalized = 'http://' + normalized;
		}
		
		return normalized;
	}

	/**
	 * Normalize OTLP gRPC endpoint - follows Go's gRPC endpoint handling
	 * Should be host:port without http:// prefix
	 */
	private normalizeGRPCEndpoint(endpoint: string): string {
		// Remove http:// or https:// prefix for gRPC
		let normalized = endpoint.replace(/^https?:\/\//, '');
		
		// Remove any path components (gRPC doesn't use paths)
		const pathIndex = normalized.indexOf('/');
		if (pathIndex >= 0) {
			normalized = normalized.substring(0, pathIndex);
		}
		
		return normalized;
	}	/**
	 * Check if tracing is enabled
	 */
	isEnabled(): boolean {
		return this.config?.enabled === true && this.tracer !== undefined;
	}

	/**
	 * Start a new span
	 */
	startSpan(name: string, options?: SpanOptions): any {
		if (!this.isEnabled() || !this.tracer || !otelApi) {
			return undefined;
		}

		try {
			console.log(`[MemoryTracer] Starting span: ${name}`);
			const SpanKind = otelApi.SpanKind;
			// Map kind string to SpanKind enum
			let kind = SpanKind.INTERNAL;
			if (options?.kind) {
				switch (options.kind) {
					case 'CLIENT':
						kind = SpanKind.CLIENT;
						break;
					case 'SERVER':
						kind = SpanKind.SERVER;
						break;
					case 'PRODUCER':
						kind = SpanKind.PRODUCER;
						break;
					case 'CONSUMER':
						kind = SpanKind.CONSUMER;
						break;
				}
			}

			// Sanitize initial attributes
			const attributes: Record<string, string | number | boolean> = {};
			if (options?.attributes) {
				for (const [key, value] of Object.entries(options.attributes)) {
					const sanitized = SensitiveDataSpanProcessor.sanitizeAttribute(key, value);
					if (sanitized !== undefined) {
						attributes[key] = sanitized;
					}
				}
			}

			// Start span with context
			const spanOptions: any = {
				kind,
				attributes,
				startTime: options?.startTime,
			};

			// Handle parent context
			let activeContext = otelApi.context.active();
			if (options?.parent) {
				// Parent can be Span or Context
				if (typeof (options.parent as any).spanContext === 'function') {
					activeContext = otelApi.trace.setSpan(activeContext, options.parent as any);
				} else {
					activeContext = options.parent as any;
				}
			}

			return this.tracer.startSpan(name, spanOptions, activeContext);
		} catch (error) {
			console.warn('Failed to start span:', error);
			return undefined;
		}
	}

	/**
	 * End a span successfully
	 */
	endSpan(span: any): void {
		if (!span) {
			return;
		}

		try {
			console.log('[MemoryTracer] Ending span successfully');
			span.setStatus({ code: otelApi.SpanStatusCode.OK });
			span.end();
			console.log('[MemoryTracer] Span ended - will export in batch within 500ms');
		} catch (error) {
			console.warn('Failed to end span:', error);
		}
	}

	/**
	 * End a span with error status
	 */
	endSpanWithError(span: any, error: Error | string): void {
		if (!span) {
			return;
		}

		try {
			const errorMessage = error instanceof Error ? error.message : error;
			span.setStatus({
				code: otelApi.SpanStatusCode.ERROR,
				message: errorMessage,
			});
			span.recordException(error instanceof Error ? error : new Error(errorMessage));
			span.end();
		} catch (err) {
			console.warn('Failed to end span with error:', err);
		}
	}

	/**
	 * Add attributes to a span
	 */
	addAttributes(
		span: any,
		attributes: Record<string, string | number | boolean>,
	): void {
		if (!span) {
			return;
		}

		try {
			for (const [key, value] of Object.entries(attributes)) {
				const sanitized = SensitiveDataSpanProcessor.sanitizeAttribute(key, value);
				if (sanitized !== undefined) {
					span.setAttribute(key, sanitized);
				}
			}
		} catch (error) {
			console.warn('Failed to add attributes:', error);
		}
	}

	/**
	 * Add an event to a span
	 */
	addEvent(
		span: any,
		name: string,
		attributes?: Record<string, string | number | boolean>,
	): void {
		if (!span) {
			return;
		}

		try {
			if (attributes) {
				const sanitized: Record<string, string | number | boolean> = {};
				for (const [key, value] of Object.entries(attributes)) {
					const sanitizedValue = SensitiveDataSpanProcessor.sanitizeAttribute(key, value);
					if (sanitizedValue !== undefined) {
						sanitized[key] = sanitizedValue;
					}
				}
				span.addEvent(name, sanitized);
			} else {
				span.addEvent(name);
			}
		} catch (error) {
			console.warn('Failed to add event:', error);
		}
	}

	/**
	 * Create a child span
	 */
	createChildSpan(
		parent: any,
		name: string,
		options?: Omit<SpanOptions, 'parent'>,
	): any {
		if (!parent) {
			return undefined;
		}

		return this.startSpan(name, {
			...options,
			parent,
		});
	}

	/**
	 * Extract trace context from metadata
	 */
	extractContext(metadata: any): any {
		if (!metadata || !this.isEnabled()) {
			return undefined;
		}

		try {
			// Use W3C Trace Context propagator
			const propagator = new W3CTraceContextPropagator();
			const carrier = metadata.traceContext || metadata;
			return propagator.extract(otelApi.context.active(), carrier, {
				get(carrier: any, key: string) {
					return carrier[key];
				},
				keys(carrier: any) {
					return Object.keys(carrier);
				},
			});
		} catch (error) {
			console.warn('Failed to extract context:', error);
			return undefined;
		}
	}

	/**
	 * Inject trace context into metadata
	 */
	injectContext(span: any): any {
		if (!span || !this.isEnabled()) {
			return undefined;
		}

		try {
			const propagator = new W3CTraceContextPropagator();
			const carrier: Record<string, string> = {};
			const spanContext = otelApi.trace.setSpan(otelApi.context.active(), span);

			propagator.inject(spanContext, carrier, {
				set(carrier: any, key: string, value: string) {
					carrier[key] = value;
				},
			});

			return carrier;
		} catch (error) {
			console.warn('Failed to inject context:', error);
			return undefined;
		}
	}

	/**
	 * Flush pending spans - forces export before continuing
	 */
	async flush(): Promise<void> {
		if (this.provider) {
			try {
				console.log('[MemoryTracer] Flushing pending spans...');
				await this.provider.forceFlush();
				console.log('[MemoryTracer] ✅ Flush complete');
			} catch (error) {
				console.error('[MemoryTracer] ❌ Failed to flush spans:', error);
			}
		}
	}

	/**
	 * Shutdown the tracer - follows Go pattern's defer tp.Shutdown()
	 * Ensures all spans are exported before terminating
	 */
	async shutdown(): Promise<void> {
		if (this.provider) {
			try {
				console.log('[MemoryTracer] Shutting down tracer (this will flush pending spans)...');
				await this.provider.shutdown();
				console.log('[MemoryTracer] ✅ Tracer shutdown complete');
				this.provider = undefined;
				this.tracer = undefined;
			} catch (error) {
				console.error('[MemoryTracer] ❌ Failed to shutdown tracer:', error);
				if (error instanceof Error) {
					console.error('[MemoryTracer] Error stack:', error.stack);
				}
			}
		}
	}
}

/**
 * Utility function to wrap operations with automatic span management
 */
export async function withSpan<T>(
	tracer: MemoryTracer,
	name: string,
	operation: (span: any) => Promise<T>,
	options?: SpanOptions,
): Promise<T> {
	const span = tracer.startSpan(name, options);
	try {
		const result = await operation(span);
		tracer.endSpan(span);
		return result;
	} catch (error) {
		tracer.endSpanWithError(span, error as Error);
		throw error;
	}
}

// Export types and constants
export { TracingConfig, SpanOptions } from './tracingConfig';
export { SAFE_SPAN_ATTRIBUTES, SensitiveDataSpanProcessor } from './spanProcessor';
