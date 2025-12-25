/**
 * MemoryTracer - n8n Cloud Compliant Tracing
 *
 * Feature: 006-n8n-compliant-tracing
 *
 * Provides in-memory operation tracing without external dependencies.
 * Captures operation lifecycle, timing, errors, and metadata for debugging.
 *
 * n8n Cloud Compliant:
 * - No external dependencies (no @opentelemetry, no jaeger-client)
 * - No Node.js built-ins beyond standard runtime (uses crypto.randomUUID, Date)
 * - No restricted globals (__dirname, process.env)
 * - Output via n8n's INodeExecutionData interface
 */

import type {
  TracingConfig as TracingConfigType,
  TraceEntry,
  OperationType,
  ResourceType,
} from './traceTypes';
import { TraceCollector } from './traceCollector';
import type { INodeExecutionData } from 'n8n-workflow';
import { exportToJaeger } from './otlpConverter';

/**
 * MemoryTracer - Main facade for tracing operations
 */
export class MemoryTracer {
  private config: TracingConfigType;
  private collector: TraceCollector;

  constructor(config: TracingConfigType) {
    this.config = config;
    this.collector = new TraceCollector();
  }

  /**
   * Check if tracing is enabled
   */
  isEnabled(): boolean {
    return this.config.enabled === true;
  }

  /**
   * Generate unique trace ID using UUID v4
   * @returns RFC 4122 compliant UUID v4 string
   */
  private generateTraceId(): string {
    return crypto.randomUUID();
  }

  /**
   * Generate ISO 8601 timestamp
   * @returns ISO 8601 formatted timestamp string
   */
  private generateTimestamp(): string {
    return new Date().toISOString();
  }

  /**
   * Infer API endpoint from operation type
   * @param type Operation type
   * @returns API endpoint path
   */
  private inferEndpoint(resource: ResourceType, type: OperationType): string {
    const base = resource === 'project' ? '/projects' : '/memories';
    const endpoints: Record<OperationType, string> = {
      store: `${base}`,
      create: `${base}`,
      retrieve: `${base}/get`,
      search: `${base}/search`,
      enrich: `${base}/enrich`,
      delete: `${base}/delete`,
    };

    return endpoints[type] || `${base}`;
  }

  /**
   * Start a new operation trace
   * @param type Operation type
   * @param metadata Initial metadata (optional)
   * @param parentTraceId Optional parent trace ID for nested operations
   * @returns Trace ID for later completion
   */
  startOperation(
    source: ResourceType,
    type: OperationType,
    metadata: any = {},
    parentTraceId?: string,
  ): string {
    if (!this.config.enabled) return '';

    try {
      const traceId = this.generateTraceId();
      const entry: TraceEntry = {
        traceId,
        parentTraceId,
        timestamp: this.generateTimestamp(),
        resourceType: source,
        operationType: type,
        status: 'started',
        metadata: {
          apiEndpoint: this.inferEndpoint(source, type),
          ...metadata,
        },
      };

      this.collector.addTrace(entry);
      return traceId;
    } catch (error) {
      // FR-014: Tracing errors must not break main operation
      console.error('MemoryTracer.startOperation failed:', error);
      return '';
    }
  }

  /**
   * Complete an operation trace
   * @param traceId Trace ID from startOperation
   * @param result Result data (success: true/false, metadata, error)
   */
  completeOperation(traceId: string, result: any): void {
    if (!this.config.enabled || !traceId) return;

    try {
      this.collector.updateTrace(traceId, result);
    } catch (error) {
      // FR-014: Tracing errors must not break main operation
      console.error('MemoryTracer.completeOperation failed:', error);
    }
  }

  /**
   * Get all trace entries formatted as n8n output
   * @returns Array of INodeExecutionData with trace entries
   */
  getTraceOutput(): INodeExecutionData[] {
    if (!this.config.enabled) return [];

    try {
      const traces = this.collector.getAllTraces();
      // Format as JSON (human-readable formatting will be added in later phase)
      return traces.map((trace) => ({ json: trace as any }));
    } catch (error) {
      console.error('MemoryTracer.getTraceOutput failed:', error);
      return [];
    }
  }

  /**
   * Export traces to Jaeger via OTLP HTTP
   * Non-blocking - sends traces in background without waiting for response
   * @param endpoint Jaeger OTLP HTTP endpoint URL
   */
  async exportTracesToJaeger(endpoint: string): Promise<void> {
    console.error(
      `[DEBUG] exportTracesToJaeger called - enabled: ${this.config.enabled}, endpoint: ${endpoint}`,
    );

    if (!this.config.enabled) {
      console.error('[DEBUG] Tracing not enabled, skipping export');
      return;
    }

    try {
      const allTraces = this.collector.getAllTraces();
      console.error(`[DEBUG] Got ${allTraces.length} traces from collector`);

      // Build set of parent trace IDs that have children
      const parentTraceIds = new Set<string>();
      for (const trace of allTraces) {
        if (trace.parentTraceId) {
          parentTraceIds.add(trace.parentTraceId);
        }
      }

      // Export completed traces + parent spans that have children (even if still 'started')
      const tracesToExport = allTraces.filter((trace) => {
        // Always include completed traces
        if (trace.status !== 'started') return true;

        // Include 'started' traces if they are parent spans with children
        return parentTraceIds.has(trace.traceId);
      });

      console.error(`[DEBUG] Filtered to ${tracesToExport.length} traces for export`);

      if (tracesToExport.length > 0) {
        console.error(`[DEBUG] Calling exportToJaeger with ${tracesToExport.length} traces`);
        // Fire and forget - don't await to avoid blocking workflow
        exportToJaeger(tracesToExport, endpoint).catch((error) => {
          console.error('MemoryTracer.exportTracesToJaeger failed:', error);
        });
      } else {
        console.error('[DEBUG] No traces to export after filtering');
      }

      // Log export stats
      const skippedCount = allTraces.length - tracesToExport.length;
      if (skippedCount > 0) {
        console.error(`[OTLP Export] Skipped ${skippedCount} orphaned incomplete trace(s)`);
      }
    } catch (error) {
      console.error('MemoryTracer.exportTracesToJaeger failed:', error);
    }
  }

  // ============================================================================
  // Legacy Jaeger-style methods (backward compatibility)
  // These are no-ops when cloud tracing is not enabled
  // ============================================================================

  /**
   * Legacy initialize method for Jaeger-style tracing
   * @deprecated Use constructor with TracingConfig instead
   */
  initialize(_config: TracingConfig): void {
    // No-op: Cloud tracing uses constructor configuration
  }

  /**
   * Legacy startSpan method for Jaeger-style tracing
   * @deprecated Use startOperation instead
   */
  startSpan(_name: string, _options?: SpanOptions): any {
    // No-op: Returns undefined to avoid breaking existing code
    return undefined;
  }

  /**
   * Legacy addEvent method for Jaeger-style tracing
   * @deprecated Events not supported in cloud tracing
   */
  addEvent(_span: any, _name: string, _attributes?: Record<string, any>): void {
    // No-op: Events not captured in cloud tracing
  }

  /**
   * Legacy addAttributes method for Jaeger-style tracing
   * @deprecated Use metadata in startOperation/completeOperation instead
   */
  addAttributes(_span: any, _attributes: Record<string, any>): void {
    // No-op: Attributes should be passed to startOperation/completeOperation
  }

  /**
   * Legacy endSpan method for Jaeger-style tracing
   * @deprecated Use completeOperation instead
   */
  endSpan(_span: any): void {
    // No-op: Use completeOperation for cloud tracing
  }

  /**
   * Legacy endSpanWithError method for Jaeger-style tracing
   * @deprecated Use completeOperation with error result instead
   */
  endSpanWithError(_span: any, _error: Error): void {
    // No-op: Use completeOperation with error for cloud tracing
  }
}

// Legacy interfaces for backward compatibility with existing code
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
