import type { Span, Context } from '@opentelemetry/api';
import type { ReadableSpan, SpanProcessor } from '@opentelemetry/sdk-trace-base';
export declare const SAFE_SPAN_ATTRIBUTES: Set<string>;
export declare const MAX_ATTRIBUTE_VALUE_LENGTH = 256;
export declare class SensitiveDataSpanProcessor implements SpanProcessor {
    onStart(_span: Span, _parentContext: Context): void;
    onEnd(_span: ReadableSpan): void;
    shutdown(): Promise<void>;
    forceFlush(): Promise<void>;
    static sanitizeAttribute(key: string, value: string | number | boolean): string | number | boolean | undefined;
}
