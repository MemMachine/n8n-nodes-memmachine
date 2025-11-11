/**
 * Simple OTLP HTTP Trace Exporter
 * 
 * Lightweight implementation that sends traces directly using fetch/https
 * without dependencies on @opentelemetry/exporter-trace-otlp-http
 */

interface ExportResult {
	code: number;
}

interface ReadableSpan {
	name: string;
	spanContext(): any;
	startTime: [number, number];
	endTime: [number, number];
	attributes: Record<string, any>;
	events: any[];
	status: { code: number };
	kind: number;
	resource: any;
	instrumentationLibrary: any;
	parentSpanId?: string;
	links: any[];
	duration: [number, number];
}

export class SimpleOTLPHTTPExporter {
	private url: string;
	private headers: Record<string, string>;

	constructor(config: { url: string }) {
		this.url = config.url;
		this.headers = {
			'Content-Type': 'application/json',
		};
	}

	async export(spans: ReadableSpan[], resultCallback: (result: ExportResult) => void): Promise<void> {
		try {
			const payload = this.serializeSpans(spans);
			
			const https = require('https');
			const http = require('http');
			const url = require('url');
			
			const parsedUrl = url.parse(this.url);
			const protocol = parsedUrl.protocol === 'https:' ? https : http;
			
			const options = {
				method: 'POST',
				headers: {
					...this.headers,
					'Content-Length': Buffer.byteLength(payload),
				},
			};
			
			const req = protocol.request(this.url, options, (res: any) => {
				let data = '';
				res.on('data', (chunk: any) => data += chunk);
				res.on('end', () => {
					if (res.statusCode >= 200 && res.statusCode < 300) {
						resultCallback({ code: 0 }); // Success
					} else {
						console.error(`[SimpleOTLPHTTPExporter] Export failed: ${res.statusCode} ${data}`);
						resultCallback({ code: 1 }); // Failure
					}
				});
			});
			
			req.on('error', (error: Error) => {
				console.error('[SimpleOTLPHTTPExporter] Export error:', error);
				resultCallback({ code: 1 });
			});
			
			req.write(payload);
			req.end();
		} catch (error) {
			console.error('[SimpleOTLPHTTPExporter] Serialization error:', error);
			resultCallback({ code: 1 });
		}
	}

	async shutdown(): Promise<void> {
		// No cleanup needed
	}

	private serializeSpans(spans: ReadableSpan[]): string {
		const resourceSpans = [{
			resource: {
				attributes: spans[0]?.resource?.attributes ? this.serializeAttributes(spans[0].resource.attributes) : [],
			},
			scopeSpans: [{
				scope: {
					name: spans[0]?.instrumentationLibrary?.name || 'unknown',
					version: spans[0]?.instrumentationLibrary?.version || '0.0.0',
				},
				spans: spans.map(span => this.serializeSpan(span)),
			}],
		}];

		return JSON.stringify({ resourceSpans });
	}

	private serializeSpan(span: ReadableSpan): any {
		const spanContext = span.spanContext();
		return {
			traceId: spanContext.traceId,
			spanId: spanContext.spanId,
			parentSpanId: span.parentSpanId || undefined,
			name: span.name,
			kind: span.kind,
			startTimeUnixNano: this.hrTimeToNanos(span.startTime),
			endTimeUnixNano: this.hrTimeToNanos(span.endTime),
			attributes: this.serializeAttributes(span.attributes),
			events: span.events.map(event => ({
				timeUnixNano: this.hrTimeToNanos(event.time),
				name: event.name,
				attributes: this.serializeAttributes(event.attributes || {}),
			})),
			status: {
				code: span.status.code,
			},
		};
	}

	private serializeAttributes(attributes: Record<string, any>): any[] {
		return Object.entries(attributes).map(([key, value]) => ({
			key,
			value: this.serializeValue(value),
		}));
	}

	private serializeValue(value: any): any {
		if (typeof value === 'string') {
			return { stringValue: value };
		} else if (typeof value === 'number') {
			if (Number.isInteger(value)) {
				return { intValue: value };
			} else {
				return { doubleValue: value };
			}
		} else if (typeof value === 'boolean') {
			return { boolValue: value };
		} else {
			return { stringValue: String(value) };
		}
	}

	private hrTimeToNanos(hrTime: [number, number]): string {
		const [seconds, nanoseconds] = hrTime;
		return (BigInt(seconds) * BigInt(1000000000) + BigInt(nanoseconds)).toString();
	}
}
