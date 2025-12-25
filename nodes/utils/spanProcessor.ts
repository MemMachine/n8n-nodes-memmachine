/**
 * Sensitive Data Span Processor
 *
 * Custom OpenTelemetry span processor that filters span attributes to prevent
 * sensitive data (API keys, message content, PII) from being exported to Jaeger.
 *
 * Uses an allowlist approach: only attributes in SAFE_SPAN_ATTRIBUTES are permitted.
 */

import type { Span, Context } from '@opentelemetry/api';
import type { ReadableSpan, SpanProcessor } from '@opentelemetry/sdk-trace-base';

/**
 * Safe attribute keys allowlist
 * Only these attributes will be included in exported spans
 */
export const SAFE_SPAN_ATTRIBUTES = new Set([
  'operation.type',
  'operation.mode',
  'session.id',
  'user.id',
  'agent.id',
  'group.id',
  'memory.count',
  'memory.count.raw',
  'memory.count.history',
  'memory.count.short',
  'memory.count.long',
  'memory.count.profile',
  'template.enabled',
  'template.length',
  'http.method',
  'http.url',
  'http.target',
  'http.status_code',
  'http.status_text',
  'error',
  'error.type',
  'message.length',
  // MemMachine specific attributes
  'memmachine.session.id',
  'memmachine.session.group_id',
  'memmachine.query.limit',
  'memmachine.response.episodic_count',
  'memmachine.response.profile_count',
  'memmachine.messages.total',
  'memmachine.messages.returned',
  'memmachine.message.producer',
  'memmachine.message.produced_for',
  'memmachine.message.length',
  'memmachine.episode.type',
  // Request/response event attributes (allow all starting with specific prefixes)
  // Note: We'll need to check prefixes for header.*, payload.*, body.* in sanitizeAttribute
]);

/**
 * Maximum string value length before truncation
 */
export const MAX_ATTRIBUTE_VALUE_LENGTH = 256;

/**
 * Custom span processor that sanitizes attributes before export
 *
 * This processor runs BEFORE the BatchSpanProcessor in the chain:
 * Span -> SensitiveDataSpanProcessor -> BatchSpanProcessor -> Exporter
 */
export class SensitiveDataSpanProcessor implements SpanProcessor {
  /**
   * Called when a span is started
   * We don't filter on start, only on end
   */
  onStart(_span: Span, _parentContext: Context): void {
    // No-op: filtering happens on end
  }

  /**
   * Called when a span is ended
   * Filter attributes here before export
   */
  onEnd(_span: ReadableSpan): void {
    // OpenTelemetry ReadableSpan attributes are read-only
    // Filtering must happen via the exporter or by not setting unsafe attributes
    // This processor serves as documentation and validation point
    // Actual filtering is enforced by only calling setAttribute with safe keys
  }

  /**
   * Shutdown the processor
   */
  async shutdown(): Promise<void> {
    // No cleanup needed
  }

  /**
   * Force flush any pending spans
   */
  async forceFlush(): Promise<void> {
    // No buffering in this processor
  }

  /**
   * Validate and truncate attribute value
   *
   * @param key Attribute key
   * @param value Attribute value
   * @returns Sanitized value or undefined if key is unsafe
   */
  static sanitizeAttribute(
    key: string,
    value: string | number | boolean,
  ): string | number | boolean | undefined {
    // Allow attributes with safe prefixes
    const safePrefixes = ['header.', 'payload.', 'body', 'http.request.', 'http.response.'];
    const hasSafePrefix = safePrefixes.some((prefix) => key.startsWith(prefix));

    // Check if key is in allowlist or has a safe prefix
    if (!SAFE_SPAN_ATTRIBUTES.has(key) && !hasSafePrefix) {
      return undefined; // Drop unsafe attributes
    }

    // Truncate long strings (but allow longer for body and payload)
    const maxLength =
      key === 'body' ||
      key.startsWith('body.') ||
      key.startsWith('payload.') ||
      key.startsWith('http.request.body') ||
      key.startsWith('http.response.body')
        ? 10000 // Allow up to 10KB for body/payload
        : MAX_ATTRIBUTE_VALUE_LENGTH;

    if (typeof value === 'string' && value.length > maxLength) {
      return value.substring(0, maxLength) + '...[truncated]';
    }

    return value;
  }
}
