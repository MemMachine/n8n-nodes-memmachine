"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SensitiveDataSpanProcessor = exports.SAFE_SPAN_ATTRIBUTES = exports.MemoryTracer = void 0;
exports.withSpan = withSpan;
const spanProcessor_1 = require("./spanProcessor");
let otelApi;
let NodeTracerProvider;
let JaegerExporter;
let OTLPTraceExporterGRPC;
let Resource;
let W3CTraceContextPropagator;
let BatchSpanProcessor;
function requireFromRoot(moduleName) {
    const path = require('path');
    const fs = require('fs');
    const searchPaths = [
        path.join(__dirname, '../../..', 'node_modules'),
        '/usr/local/lib/node_modules/n8n/node_modules',
        null,
    ];
    const pnpmBase = '/usr/local/lib/node_modules/n8n/node_modules/.pnpm';
    if (fs.existsSync(pnpmBase)) {
        try {
            const pnpmPrefix = moduleName.replace('/', '+');
            const dirs = fs.readdirSync(pnpmBase);
            for (const dir of dirs) {
                if (dir.startsWith(pnpmPrefix + '@')) {
                    const fullPath = path.join(pnpmBase, dir, 'node_modules', moduleName);
                    if (fs.existsSync(fullPath)) {
                        searchPaths.splice(1, 0, fullPath);
                        break;
                    }
                }
            }
        }
        catch (e) {
        }
    }
    const errors = [];
    for (const searchPath of searchPaths) {
        try {
            if (searchPath === null) {
                return require(moduleName);
            }
            else {
                const fullPath = path.join(searchPath, moduleName);
                return require(fullPath);
            }
        }
        catch (error) {
            const errMsg = error instanceof Error ? error.message : String(error);
            errors.push(`${searchPath || 'standard'}: ${errMsg}`);
            continue;
        }
    }
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
    try {
        const jaegerModule = requireFromRoot('@opentelemetry/exporter-jaeger');
        JaegerExporter = jaegerModule.JaegerExporter;
    }
    catch (e) {
        console.warn('[MemoryTracer] Jaeger exporter not available');
    }
    try {
        const otlpGrpcModule = requireFromRoot('@opentelemetry/exporter-trace-otlp-grpc');
        OTLPTraceExporterGRPC = otlpGrpcModule.OTLPTraceExporter;
    }
    catch (e) {
        console.warn('[MemoryTracer] OTLP gRPC exporter not available');
    }
    console.log('[MemoryTracer] OpenTelemetry dependencies loaded successfully');
}
catch (error) {
    console.warn('[MemoryTracer] OpenTelemetry dependencies not available. Tracing will be disabled.', error);
}
class MemoryTracer {
    provider;
    tracer;
    config;
    initialize(config) {
        if (!config.enabled) {
            this.config = config;
            return;
        }
        if (!otelApi || !NodeTracerProvider) {
            console.warn('OpenTelemetry not available, tracing disabled');
            this.config = { ...config, enabled: false };
            return;
        }
        try {
            this.config = config;
            console.log(`[MemoryTracer] Initializing tracing with endpoint: ${config.endpoint}, protocol: ${config.protocol}`);
            console.log('[MemoryTracer] Step 1: Creating exporter...');
            const exporter = this.createExporter(config);
            console.log('[MemoryTracer] Step 1: ✓ Exporter created');
            console.log('[MemoryTracer] Step 2: Creating resource...');
            console.log('[MemoryTracer] DEBUG: About to call new Resource(), type:', typeof Resource);
            const resource = new Resource({
                'service.name': config.serviceName || 'n8n-memory-node',
                'service.version': '1.0.0',
                'deployment.environment': process.env.NODE_ENV || 'development',
                'telemetry.sdk.name': 'opentelemetry',
                'telemetry.sdk.language': 'nodejs',
                'telemetry.sdk.version': '1.x',
                'tracing.protocol': config.protocol,
            });
            console.log('[MemoryTracer] Step 2: ✓ Resource created with service:', config.serviceName || 'n8n-memory-node');
            console.log('[MemoryTracer] Step 3: Creating BatchSpanProcessor...');
            const spanProcessor = new BatchSpanProcessor(exporter, {
                maxQueueSize: 100,
                maxExportBatchSize: 10,
                scheduledDelayMillis: 500,
                exportTimeoutMillis: 30000,
            });
            console.log('[MemoryTracer] Step 3: ✓ BatchSpanProcessor created');
            console.log('[MemoryTracer] Step 4: Creating NodeTracerProvider...');
            this.provider = new NodeTracerProvider({
                resource,
            });
            this.provider.addSpanProcessor(spanProcessor);
            this.provider.addSpanProcessor(new spanProcessor_1.SensitiveDataSpanProcessor());
            console.log('[MemoryTracer] Step 4: ✓ NodeTracerProvider created');
            console.log('[MemoryTracer] Step 5: Registering provider...');
            this.provider.register({
                propagator: new W3CTraceContextPropagator(),
            });
            console.log('[MemoryTracer] Step 5: ✓ Provider registered');
            console.log('[MemoryTracer] Step 6: Getting tracer instance...');
            this.tracer = this.provider.getTracer('n8n-memory-node', '1.0.0');
            console.log('[MemoryTracer] Step 6: ✓ Tracer instance obtained');
            console.log('[MemoryTracer] ✓✓✓ Tracing fully initialized and ready ✓✓✓');
        }
        catch (error) {
            console.error('[MemoryTracer] ✗✗✗ Failed to initialize tracing:', error);
            console.error('[MemoryTracer] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
            this.tracer = undefined;
        }
    }
    createExporter(config) {
        console.log('[MemoryTracer] createExporter called with protocol:', config.protocol, 'endpoint:', config.endpoint);
        switch (config.protocol) {
            case 'http':
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
    normalizeOTLPEndpoint(endpoint) {
        let normalized = endpoint;
        if (endpoint.includes(':14268')) {
            normalized = endpoint.replace(':14268/api/traces', ':4318/v1/traces')
                .replace(':14268', ':4318');
            console.log('[MemoryTracer] Converted legacy Jaeger port:', endpoint, '→', normalized);
        }
        if (!normalized.includes('/v1/traces')) {
            normalized = normalized.replace(/\/$/, '') + '/v1/traces';
        }
        if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
            normalized = 'http://' + normalized;
        }
        return normalized;
    }
    normalizeGRPCEndpoint(endpoint) {
        let normalized = endpoint.replace(/^https?:\/\//, '');
        const pathIndex = normalized.indexOf('/');
        if (pathIndex >= 0) {
            normalized = normalized.substring(0, pathIndex);
        }
        return normalized;
    }
    isEnabled() {
        return this.config?.enabled === true && this.tracer !== undefined;
    }
    startSpan(name, options) {
        if (!this.isEnabled() || !this.tracer || !otelApi) {
            return undefined;
        }
        try {
            console.log(`[MemoryTracer] Starting span: ${name}`);
            const SpanKind = otelApi.SpanKind;
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
            const attributes = {};
            if (options?.attributes) {
                for (const [key, value] of Object.entries(options.attributes)) {
                    const sanitized = spanProcessor_1.SensitiveDataSpanProcessor.sanitizeAttribute(key, value);
                    if (sanitized !== undefined) {
                        attributes[key] = sanitized;
                    }
                }
            }
            const spanOptions = {
                kind,
                attributes,
                startTime: options?.startTime,
            };
            let activeContext = otelApi.context.active();
            if (options?.parent) {
                if (typeof options.parent.spanContext === 'function') {
                    activeContext = otelApi.trace.setSpan(activeContext, options.parent);
                }
                else {
                    activeContext = options.parent;
                }
            }
            return this.tracer.startSpan(name, spanOptions, activeContext);
        }
        catch (error) {
            console.warn('Failed to start span:', error);
            return undefined;
        }
    }
    endSpan(span) {
        if (!span) {
            return;
        }
        try {
            console.log('[MemoryTracer] Ending span successfully');
            span.setStatus({ code: otelApi.SpanStatusCode.OK });
            span.end();
            console.log('[MemoryTracer] Span ended - will export in batch within 500ms');
        }
        catch (error) {
            console.warn('Failed to end span:', error);
        }
    }
    endSpanWithError(span, error) {
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
        }
        catch (err) {
            console.warn('Failed to end span with error:', err);
        }
    }
    addAttributes(span, attributes) {
        if (!span) {
            return;
        }
        try {
            for (const [key, value] of Object.entries(attributes)) {
                const sanitized = spanProcessor_1.SensitiveDataSpanProcessor.sanitizeAttribute(key, value);
                if (sanitized !== undefined) {
                    span.setAttribute(key, sanitized);
                }
            }
        }
        catch (error) {
            console.warn('Failed to add attributes:', error);
        }
    }
    addEvent(span, name, attributes) {
        if (!span) {
            return;
        }
        try {
            if (attributes) {
                const sanitized = {};
                for (const [key, value] of Object.entries(attributes)) {
                    const sanitizedValue = spanProcessor_1.SensitiveDataSpanProcessor.sanitizeAttribute(key, value);
                    if (sanitizedValue !== undefined) {
                        sanitized[key] = sanitizedValue;
                    }
                }
                span.addEvent(name, sanitized);
            }
            else {
                span.addEvent(name);
            }
        }
        catch (error) {
            console.warn('Failed to add event:', error);
        }
    }
    createChildSpan(parent, name, options) {
        if (!parent) {
            return undefined;
        }
        return this.startSpan(name, {
            ...options,
            parent,
        });
    }
    extractContext(metadata) {
        if (!metadata || !this.isEnabled()) {
            return undefined;
        }
        try {
            const propagator = new W3CTraceContextPropagator();
            const carrier = metadata.traceContext || metadata;
            return propagator.extract(otelApi.context.active(), carrier, {
                get(carrier, key) {
                    return carrier[key];
                },
                keys(carrier) {
                    return Object.keys(carrier);
                },
            });
        }
        catch (error) {
            console.warn('Failed to extract context:', error);
            return undefined;
        }
    }
    injectContext(span) {
        if (!span || !this.isEnabled()) {
            return undefined;
        }
        try {
            const propagator = new W3CTraceContextPropagator();
            const carrier = {};
            const spanContext = otelApi.trace.setSpan(otelApi.context.active(), span);
            propagator.inject(spanContext, carrier, {
                set(carrier, key, value) {
                    carrier[key] = value;
                },
            });
            return carrier;
        }
        catch (error) {
            console.warn('Failed to inject context:', error);
            return undefined;
        }
    }
    async flush() {
        if (this.provider) {
            try {
                console.log('[MemoryTracer] Flushing pending spans...');
                await this.provider.forceFlush();
                console.log('[MemoryTracer] ✅ Flush complete');
            }
            catch (error) {
                console.error('[MemoryTracer] ❌ Failed to flush spans:', error);
            }
        }
    }
    async shutdown() {
        if (this.provider) {
            try {
                console.log('[MemoryTracer] Shutting down tracer (this will flush pending spans)...');
                await this.provider.shutdown();
                console.log('[MemoryTracer] ✅ Tracer shutdown complete');
                this.provider = undefined;
                this.tracer = undefined;
            }
            catch (error) {
                console.error('[MemoryTracer] ❌ Failed to shutdown tracer:', error);
                if (error instanceof Error) {
                    console.error('[MemoryTracer] Error stack:', error.stack);
                }
            }
        }
    }
}
exports.MemoryTracer = MemoryTracer;
async function withSpan(tracer, name, operation, options) {
    const span = tracer.startSpan(name, options);
    try {
        const result = await operation(span);
        tracer.endSpan(span);
        return result;
    }
    catch (error) {
        tracer.endSpanWithError(span, error);
        throw error;
    }
}
var spanProcessor_2 = require("./spanProcessor");
Object.defineProperty(exports, "SAFE_SPAN_ATTRIBUTES", { enumerable: true, get: function () { return spanProcessor_2.SAFE_SPAN_ATTRIBUTES; } });
Object.defineProperty(exports, "SensitiveDataSpanProcessor", { enumerable: true, get: function () { return spanProcessor_2.SensitiveDataSpanProcessor; } });
//# sourceMappingURL=tracer.js.map