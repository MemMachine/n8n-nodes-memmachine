"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TraceCollector = void 0;
class TraceCollector {
    traces = new Map();
    addTrace(entry) {
        this.traces.set(entry.traceId, entry);
    }
    updateTrace(traceId, update) {
        const entry = this.traces.get(traceId);
        if (!entry)
            return;
        const startTime = new Date(entry.timestamp).getTime();
        const endTime = Date.now();
        const duration = endTime - startTime;
        Object.assign(entry, {
            status: update.success ? 'success' : 'failure',
            duration,
            metadata: { ...entry.metadata, ...update.metadata },
            error: update.error,
        });
    }
    getAllTraces() {
        return Array.from(this.traces.values());
    }
    filterTraces(filter) {
        return this.getAllTraces().filter(trace => {
            if (filter.traceId && trace.traceId !== filter.traceId) {
                return false;
            }
            if (filter.operationType && !filter.operationType.includes(trace.operationType)) {
                return false;
            }
            if (filter.status && !filter.status.includes(trace.status)) {
                return false;
            }
            if (filter.timeRange) {
                const traceTime = new Date(trace.timestamp).getTime();
                const start = new Date(filter.timeRange.start).getTime();
                const end = new Date(filter.timeRange.end).getTime();
                if (traceTime < start || traceTime > end) {
                    return false;
                }
            }
            return true;
        });
    }
    clear() {
        this.traces.clear();
    }
    count() {
        return this.traces.size;
    }
}
exports.TraceCollector = TraceCollector;
//# sourceMappingURL=traceCollector.js.map