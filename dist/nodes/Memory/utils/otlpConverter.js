"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertToOTLP = convertToOTLP;
exports.exportToJaeger = exportToJaeger;
function traceEntryToOTLPSpan(trace) {
    const startTimeNanos = new Date(trace.timestamp).getTime() * 1_000_000;
    let endTimeNanos;
    if (trace.duration && trace.duration > 0) {
        endTimeNanos = startTimeNanos + (trace.duration * 1_000_000);
    }
    else {
        endTimeNanos = startTimeNanos + 1;
    }
    let statusCode = 0;
    if (trace.status === 'success') {
        statusCode = 1;
    }
    else if (trace.status === 'failure') {
        statusCode = 2;
    }
    const attributes = [];
    if (trace.metadata) {
        for (const [key, value] of Object.entries(trace.metadata)) {
            if (value !== undefined && value !== null) {
                attributes.push({
                    key,
                    value: {
                        stringValue: String(value),
                    },
                });
            }
        }
    }
    attributes.push({ key: 'operation.type', value: { stringValue: trace.operationType } }, { key: 'trace.id', value: { stringValue: trace.traceId } });
    if (trace.error) {
        attributes.push({ key: 'error', value: { boolValue: true } }, { key: 'error.type', value: { stringValue: trace.error.type || 'unknown' } }, { key: 'error.message', value: { stringValue: trace.error.message || '' } });
        if (trace.error.code) {
            attributes.push({ key: 'error.code', value: { stringValue: trace.error.code } });
        }
    }
    let traceIdHex;
    let spanIdHex;
    let parentSpanIdHex;
    if (trace.parentTraceId) {
        const parentHexUuid = trace.parentTraceId.replace(/-/g, '');
        traceIdHex = parentHexUuid;
        parentSpanIdHex = parentHexUuid.substring(0, 16);
        const childHexUuid = trace.traceId.replace(/-/g, '');
        spanIdHex = childHexUuid.substring(0, 16);
    }
    else {
        const hexUuid = trace.traceId.replace(/-/g, '');
        traceIdHex = hexUuid;
        spanIdHex = hexUuid.substring(0, 16);
    }
    const span = {
        traceId: traceIdHex,
        spanId: spanIdHex,
        name: `memory.${trace.operationType}`,
        kind: 1,
        startTimeUnixNano: String(startTimeNanos),
        endTimeUnixNano: String(endTimeNanos),
        attributes,
        status: {
            code: statusCode,
            message: trace.error?.message || '',
        },
    };
    if (parentSpanIdHex) {
        span.parentSpanId = parentSpanIdHex;
    }
    return span;
}
function convertToOTLP(traces) {
    const spans = traces.map(traceEntryToOTLPSpan);
    return {
        resourceSpans: [
            {
                resource: {
                    attributes: [
                        { key: 'service.name', value: { stringValue: 'n8n-memmachine-memory' } },
                        { key: 'telemetry.sdk.name', value: { stringValue: 'n8n-cloud-tracer' } },
                        { key: 'telemetry.sdk.version', value: { stringValue: '1.0.0' } },
                    ],
                },
                scopeSpans: [
                    {
                        scope: {
                            name: 'n8n-memmachine-memory',
                            version: '0.2.2',
                        },
                        spans,
                    },
                ],
            },
        ],
    };
}
async function exportToJaeger(traces, endpoint) {
    if (!traces || traces.length === 0) {
        console.log('[OTLP Export] No traces to export');
        return;
    }
    try {
        console.log(`[OTLP Export] Exporting ${traces.length} traces to ${endpoint}`);
        const otlpPayload = convertToOTLP(traces);
        console.log(`[OTLP Export] OTLP payload:`, JSON.stringify(otlpPayload, null, 2).substring(0, 500));
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(otlpPayload),
        });
        if (!response.ok) {
            const responseText = await response.text();
            console.error(`[OTLP Export] Failed to send traces to Jaeger: ${response.status} ${response.statusText}`, responseText);
        }
        else {
            console.log(`[OTLP Export] Successfully sent ${traces.length} traces to Jaeger`);
        }
    }
    catch (error) {
        console.error('[OTLP Export] Error sending traces to Jaeger:', error);
    }
}
//# sourceMappingURL=otlpConverter.js.map