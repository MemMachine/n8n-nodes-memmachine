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
	const endTimeNanos = trace.duration 
		? startTimeNanos + (trace.duration * 1_000_000) 
		: startTimeNanos;

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
	// traceId needs to be 16 bytes (32 hex chars without dashes)
	// spanId needs to be 8 bytes (first 16 hex chars)
	const hexUuid = trace.traceId.replace(/-/g, '');
	const traceIdHex = hexUuid; // Full 32 hex chars
	const spanIdHex = hexUuid.substring(0, 16); // First 16 hex chars = 8 bytes

	return {
		traceId: traceIdHex,
		spanId: spanIdHex,
		name: `memory.${trace.operationType}`,
		kind: 1, // SPAN_KIND_INTERNAL
		startTimeUnixNano: String(startTimeNanos),
		endTimeUnixNano: String(endTimeNanos),
		attributes,
		status: {
			code: statusCode,
			message: trace.error?.message || '',
		},
	};
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
		} else {
			console.log(`[OTLP Export] Successfully sent ${traces.length} traces to Jaeger`);
		}
	} catch (error) {
		// Don't let export failures break the workflow
		console.error('[OTLP Export] Error sending traces to Jaeger:', error);
	}
}
