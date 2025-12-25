"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SimpleOTLPHTTPExporter = void 0;
class SimpleOTLPHTTPExporter {
    url;
    headers;
    constructor(config) {
        this.url = config.url;
        this.headers = {
            'Content-Type': 'application/json',
        };
    }
    async export(spans, resultCallback) {
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
            const req = protocol.request(this.url, options, (res) => {
                let data = '';
                res.on('data', (chunk) => (data += chunk));
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resultCallback({ code: 0 });
                    }
                    else {
                        console.error(`[SimpleOTLPHTTPExporter] Export failed: ${res.statusCode} ${data}`);
                        resultCallback({ code: 1 });
                    }
                });
            });
            req.on('error', (error) => {
                console.error('[SimpleOTLPHTTPExporter] Export error:', error);
                resultCallback({ code: 1 });
            });
            req.write(payload);
            req.end();
        }
        catch (error) {
            console.error('[SimpleOTLPHTTPExporter] Serialization error:', error);
            resultCallback({ code: 1 });
        }
    }
    async shutdown() {
    }
    serializeSpans(spans) {
        const resourceSpans = [
            {
                resource: {
                    attributes: spans[0]?.resource?.attributes
                        ? this.serializeAttributes(spans[0].resource.attributes)
                        : [],
                },
                scopeSpans: [
                    {
                        scope: {
                            name: spans[0]?.instrumentationLibrary?.name || 'unknown',
                            version: spans[0]?.instrumentationLibrary?.version || '0.0.0',
                        },
                        spans: spans.map((span) => this.serializeSpan(span)),
                    },
                ],
            },
        ];
        return JSON.stringify({ resourceSpans });
    }
    serializeSpan(span) {
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
            events: span.events.map((event) => ({
                timeUnixNano: this.hrTimeToNanos(event.time),
                name: event.name,
                attributes: this.serializeAttributes(event.attributes || {}),
            })),
            status: {
                code: span.status.code,
            },
        };
    }
    serializeAttributes(attributes) {
        return Object.entries(attributes).map(([key, value]) => ({
            key,
            value: this.serializeValue(value),
        }));
    }
    serializeValue(value) {
        if (typeof value === 'string') {
            return { stringValue: value };
        }
        else if (typeof value === 'number') {
            if (Number.isInteger(value)) {
                return { intValue: value };
            }
            else {
                return { doubleValue: value };
            }
        }
        else if (typeof value === 'boolean') {
            return { boolValue: value };
        }
        else {
            return { stringValue: String(value) };
        }
    }
    hrTimeToNanos(hrTime) {
        const [seconds, nanoseconds] = hrTime;
        return (BigInt(seconds) * BigInt(1000000000) + BigInt(nanoseconds)).toString();
    }
}
exports.SimpleOTLPHTTPExporter = SimpleOTLPHTTPExporter;
//# sourceMappingURL=simpleOTLPExporter.js.map