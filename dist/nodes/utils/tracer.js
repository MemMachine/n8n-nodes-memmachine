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
    inferEndpoint(resource, type) {
        const base = resource === 'project' ? '/projects' : '/memories';
        const endpoints = {
            store: `${base}`,
            create: `${base}`,
            retrieve: `${base}/get`,
            search: `${base}/search`,
            enrich: `${base}/enrich`,
            delete: `${base}/delete`,
        };
        return endpoints[type] || `${base}`;
    }
    startOperation(source, type, metadata = {}, parentTraceId) {
        if (!this.config.enabled)
            return '';
        try {
            const traceId = this.generateTraceId();
            const entry = {
                traceId,
                parentTraceId,
                timestamp: this.generateTimestamp(),
                resourceType: source,
                operationType: type,
                status: 'started',
                metadata: {
                    apiEndpoint: this.inferEndpoint(source, type),
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
            return traces.map((trace) => ({ json: trace }));
        }
        catch (error) {
            console.error('MemoryTracer.getTraceOutput failed:', error);
            return [];
        }
    }
    async exportTracesToJaeger(endpoint) {
        console.error(`[DEBUG] exportTracesToJaeger called - enabled: ${this.config.enabled}, endpoint: ${endpoint}`);
        if (!this.config.enabled) {
            console.error('[DEBUG] Tracing not enabled, skipping export');
            return;
        }
        try {
            const allTraces = this.collector.getAllTraces();
            console.error(`[DEBUG] Got ${allTraces.length} traces from collector`);
            const parentTraceIds = new Set();
            for (const trace of allTraces) {
                if (trace.parentTraceId) {
                    parentTraceIds.add(trace.parentTraceId);
                }
            }
            const tracesToExport = allTraces.filter((trace) => {
                if (trace.status !== 'started')
                    return true;
                return parentTraceIds.has(trace.traceId);
            });
            console.error(`[DEBUG] Filtered to ${tracesToExport.length} traces for export`);
            if (tracesToExport.length > 0) {
                console.error(`[DEBUG] Calling exportToJaeger with ${tracesToExport.length} traces`);
                (0, otlpConverter_1.exportToJaeger)(tracesToExport, endpoint).catch((error) => {
                    console.error('MemoryTracer.exportTracesToJaeger failed:', error);
                });
            }
            else {
                console.error('[DEBUG] No traces to export after filtering');
            }
            const skippedCount = allTraces.length - tracesToExport.length;
            if (skippedCount > 0) {
                console.error(`[OTLP Export] Skipped ${skippedCount} orphaned incomplete trace(s)`);
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