/**
 * OTLP Converter - Convert Cloud-Compliant Traces to OTLP JSON Format
 *
 * Converts TraceEntry objects to OpenTelemetry Protocol (OTLP) JSON format
 * for export to Jaeger or other OTLP-compatible backends.
 *
 * Uses native fetch() - no external dependencies.
 */

import type { TraceEntry } from './traceTypes';

/**
 * Convert TraceEntry to OTLP Span format
 */
function traceEntryToOTLPSpan(trace: TraceEntry): any {
  // Convert timestamp to nanoseconds (OTLP uses nanoseconds)
  const startTimeNanos = new Date(trace.timestamp).getTime() * 1_000_000;

  // Calculate end time with minimum 1 nanosecond duration to avoid negative duration errors
  let endTimeNanos: number;
  if (trace.duration && trace.duration > 0) {
    endTimeNanos = startTimeNanos + trace.duration * 1_000_000;
  } else {
    // Ensure end time is always at least 1 nanosecond after start time
    endTimeNanos = startTimeNanos + 1;
  }

  // Map status
  let statusCode = 0; // UNSET
  if (trace.status === 'success') {
    statusCode = 1; // OK
  } else if (trace.status === 'failure') {
    statusCode = 2; // ERROR
  }

  // Build attributes from metadata
  const attributes: any[] = [];
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

  // Add operation-specific attributes
  attributes.push(
    { key: 'operation.type', value: { stringValue: trace.operationType } },
    { key: 'trace.id', value: { stringValue: trace.traceId } },
  );

  // Add error information if present
  if (trace.error) {
    attributes.push(
      { key: 'error', value: { boolValue: true } },
      { key: 'error.type', value: { stringValue: trace.error.type || 'unknown' } },
      { key: 'error.message', value: { stringValue: trace.error.message || '' } },
    );
    if (trace.error.code) {
      attributes.push({ key: 'error.code', value: { stringValue: trace.error.code } });
    }
  }

  // Convert UUID to proper OTLP format
  // For parent-child relationships in OTLP:
  // - All spans in the same trace share the SAME traceId (identifies the trace tree)
  // - Each span has its own unique spanId
  // - Child spans reference their parent's spanId via parentSpanId

  let traceIdHex: string;
  let spanIdHex: string;
  let parentSpanIdHex: string | undefined;

  if (trace.parentTraceId) {
    // This is a child span - use parent's traceId for the trace tree
    const parentHexUuid = trace.parentTraceId.replace(/-/g, '');
    traceIdHex = parentHexUuid; // Share parent's trace ID

    // Use parent's UUID first 16 chars as parentSpanId
    parentSpanIdHex = parentHexUuid.substring(0, 16);

    // Generate unique spanId for this child using its own UUID
    const childHexUuid = trace.traceId.replace(/-/g, '');
    spanIdHex = childHexUuid.substring(0, 16);
  } else {
    // This is a root span - use its own UUID
    const hexUuid = trace.traceId.replace(/-/g, '');
    traceIdHex = hexUuid; // Full 32 hex chars
    spanIdHex = hexUuid.substring(0, 16); // First 16 hex chars = 8 bytes
  }

  const span: any = {
    traceId: traceIdHex,
    spanId: spanIdHex,
    name: `${trace.resourceType}.${trace.operationType}`,
    kind: 1, // SPAN_KIND_INTERNAL
    startTimeUnixNano: String(startTimeNanos),
    endTimeUnixNano: String(endTimeNanos),
    attributes,
    status: {
      code: statusCode,
      message: trace.error?.message || '',
    },
  };

  // Add parent span ID if this is a child span
  if (parentSpanIdHex) {
    span.parentSpanId = parentSpanIdHex;
  }

  return span;
}

/**
 * Convert array of TraceEntry to OTLP JSON payload
 */
export function convertToOTLP(traces: TraceEntry[]): any {
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

/**
 * Export traces to Jaeger via OTLP HTTP
 * Non-blocking - logs errors but doesn't throw
 */
export async function exportToJaeger(traces: TraceEntry[], endpoint: string): Promise<void> {
  if (!traces || traces.length === 0) {
    console.log('[OTLP Export] No traces to export');
    return;
  }

  try {
    console.log(`[OTLP Export] Exporting ${traces.length} traces to ${endpoint}`);
    const otlpPayload = convertToOTLP(traces);

    console.log(
      `[OTLP Export] OTLP payload:`,
      JSON.stringify(otlpPayload, null, 2).substring(0, 500),
    );

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(otlpPayload),
    });

    if (!response.ok) {
      const responseText = await response.text();
      console.error(
        `[OTLP Export] Failed to send traces to Jaeger: ${response.status} ${response.statusText}`,
        responseText,
      );
    } else {
      console.log(`[OTLP Export] Successfully sent ${traces.length} traces to Jaeger`);
    }
  } catch (error) {
    // Don't let export failures break the workflow
    console.error('[OTLP Export] Error sending traces to Jaeger:', error);
  }
}
