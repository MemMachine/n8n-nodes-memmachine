"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryTracer = void 0;
exports.withSpan = withSpan;
class MemoryTracer {
    enabled = false;
    constructor(_config) {
        this.enabled = false;
    }
    initialize(_config) {
    }
    startSpan(_name, _options) {
        return {
            end: () => { },
            recordException: () => { },
            setStatus: () => { },
            setAttribute: () => { },
            setAttributes: () => { },
        };
    }
    endSpan(_span) {
    }
    endSpanWithError(_span, _error) {
    }
    recordException(_span, _error) {
    }
    setSpanStatus(_span, _status) {
    }
    setAttribute(_span, _key, _value) {
    }
    setAttributes(_span, _attributes) {
    }
    addAttributes(_span, _attributes) {
    }
    addEvent(_span, _name, _attributes) {
    }
    shutdown() {
        return Promise.resolve();
    }
    isEnabled() {
        return this.enabled;
    }
}
exports.MemoryTracer = MemoryTracer;
async function withSpan(tracer, name, operation, options) {
    const span = tracer.startSpan(name, options);
    try {
        return await operation(span);
    }
    catch (error) {
        tracer.recordException(span, error);
        tracer.setSpanStatus(span, 'error');
        throw error;
    }
    finally {
        tracer.endSpan(span);
    }
}
//# sourceMappingURL=tracer.js.map