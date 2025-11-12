"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryTracer = void 0;
const traceCollector_1 = require("./traceCollector");
const otlpConverter_1 = require("./otlpConverter");
class MemoryTracer {
    config;
    collector;
    constructor(config) {
        this.config = config;
        this.collector = new traceCollector_1.TraceCollector();
    }
    isEnabled() {
        return this.config.enabled === true;
    }
    generateTraceId() {
        return crypto.randomUUID();
    }
    generateTimestamp() {
        return new Date().toISOString();
    }
    inferEndpoint(type) {
        const endpoints = {
            store: '/v1/memories',
            retrieve: '/v1/memories/search',
            search: '/v1/memories/search',
            enrich: '/v1/memories/enrich',
        };
        return endpoints[type] || '/v1/memories';
    }
    startOperation(type, metadata = {}) {
        if (!this.config.enabled)
            return '';
        try {
            const traceId = this.generateTraceId();
            const entry = {
                traceId,
                timestamp: this.generateTimestamp(),
                operationType: type,
                status: 'started',
                metadata: {
                    apiEndpoint: this.inferEndpoint(type),
                    ...metadata,
                },
            };
            this.collector.addTrace(entry);
            return traceId;
        }
        catch (error) {
            console.error('MemoryTracer.startOperation failed:', error);
            return '';
        }
    }
    completeOperation(traceId, result) {
        if (!this.config.enabled || !traceId)
            return;
        try {
            this.collector.updateTrace(traceId, result);
        }
        catch (error) {
            console.error('MemoryTracer.completeOperation failed:', error);
        }
    }
    getTraceOutput() {
        if (!this.config.enabled)
            return [];
        try {
            const traces = this.collector.getAllTraces();
            return traces.map(trace => ({ json: trace }));
        }
        catch (error) {
            console.error('MemoryTracer.getTraceOutput failed:', error);
            return [];
        }
    }
    async exportTracesToJaeger(endpoint) {
        if (!this.config.enabled)
            return;
        try {
            const traces = this.collector.getAllTraces();
            if (traces.length > 0) {
                (0, otlpConverter_1.exportToJaeger)(traces, endpoint).catch(error => {
                    console.error('MemoryTracer.exportTracesToJaeger failed:', error);
                });
            }
        }
        catch (error) {
            console.error('MemoryTracer.exportTracesToJaeger failed:', error);
        }
    }
    initialize(_config) {
    }
    startSpan(_name, _options) {
        return undefined;
    }
    addEvent(_span, _name, _attributes) {
    }
    addAttributes(_span, _attributes) {
    }
    endSpan(_span) {
    }
    endSpanWithError(_span, _error) {
    }
}
exports.MemoryTracer = MemoryTracer;
//# sourceMappingURL=tracer.js.map