/**
 * No-op Tracer Stub
 * 
 * This file provides a minimal tracer interface that doesn't use any restricted
 * Node.js modules or external dependencies. All tracing functionality is disabled.
 * 
 * This is compliant with n8n Cloud requirements:
 * - No Node.js built-in modules (fs, path, http, https)
 * - No external dependencies (@opentelemetry, jaeger-client)
 * - No restricted globals (__dirname, process)
 */

export interface TracingConfig {
  enabled?: boolean;
  exporterType?: 'jaeger' | 'otlp-grpc' | 'otlp-http' | 'console';
  endpoint?: string;
  serviceName?: string;
  protocol?: 'http' | 'udp' | 'grpc';
}

export interface SpanOptions {
  attributes?: Record<string, string | number | boolean>;
  parentSpan?: any;
}

/**
 * No-op tracer implementation
 * All methods are stubs that do nothing
 */
export class MemoryTracer {
  private enabled: boolean = false;

  constructor(_config?: TracingConfig) {
    this.enabled = false; // Always disabled for n8n Cloud compatibility
  }

  initialize(_config: TracingConfig): void {
    // No-op
  }

  startSpan(_name: string, _options?: SpanOptions): any {
    return {
      end: () => {},
      recordException: () => {},
      setStatus: () => {},
      setAttribute: () => {},
      setAttributes: () => {},
    };
  }

  endSpan(_span: any): void {
    // No-op
  }

  endSpanWithError(_span: any, _error: Error): void {
    // No-op
  }

  recordException(_span: any, _error: Error): void {
    // No-op
  }

  setSpanStatus(_span: any, _status: string): void {
    // No-op
  }

  setAttribute(_span: any, _key: string, _value: string | number | boolean): void {
    // No-op
  }

  setAttributes(_span: any, _attributes: Record<string, string | number | boolean>): void {
    // No-op
  }

  addAttributes(_span: any, _attributes: Record<string, string | number | boolean>): void {
    // No-op
  }

  addEvent(_span: any, _name: string, _attributes?: Record<string, string | number | boolean>): void {
    // No-op
  }

  shutdown(): Promise<void> {
    return Promise.resolve();
  }

  isEnabled(): boolean {
    return this.enabled;
  }
}

/**
 * Utility function to wrap operations in spans (no-op)
 */
export async function withSpan<T>(
  tracer: MemoryTracer,
  name: string,
  operation: (span: any) => Promise<T>,
  options?: SpanOptions
): Promise<T> {
  const span = tracer.startSpan(name, options);
  try {
    return await operation(span);
  } catch (error) {
    tracer.recordException(span, error as Error);
    tracer.setSpanStatus(span, 'error');
    throw error;
  } finally {
    tracer.endSpan(span);
  }
}
