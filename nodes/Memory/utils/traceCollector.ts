/**
 * TraceCollector - In-memory trace storage and filtering
 * 
 * Feature: 006-n8n-compliant-tracing
 * 
 * Manages trace entries in memory during workflow execution.
 * Provides storage, retrieval, update, and filtering capabilities.
 * 
 * n8n Cloud Compliant:
 * - No external dependencies
 * - No Node.js built-ins
 * - In-memory only (no persistence)
 */

import type { TraceEntry, TraceFilter } from './traceTypes';

/**
 * TraceCollector manages trace entries during workflow execution
 */
export class TraceCollector {
	private traces: Map<string, TraceEntry> = new Map();

	/**
	 * Add a new trace entry to the collection
	 * @param entry TraceEntry to store
	 */
	addTrace(entry: TraceEntry): void {
		this.traces.set(entry.traceId, entry);
	}

	/**
	 * Update an existing trace entry
	 * @param traceId Trace ID to update
	 * @param update Partial update data (status, duration, metadata, error)
	 */
	updateTrace(traceId: string, update: {
		success?: boolean;
		metadata?: any;
		error?: any;
	}): void {
		const entry = this.traces.get(traceId);
		if (!entry) return;

		// Calculate duration from start timestamp
		const startTime = new Date(entry.timestamp).getTime();
		const endTime = Date.now();
		const duration = endTime - startTime;

		// Ensure minimum duration of 1ms to avoid zero-duration spans in Jaeger
		const safeDuration = Math.max(duration, 1);

		// Update entry with completion data
		Object.assign(entry, {
			status: update.success ? 'success' : 'failure',
			duration: safeDuration,
			metadata: { ...entry.metadata, ...update.metadata },
			error: update.error,
		});
	}

	/**
	 * Get all trace entries as an array
	 * @returns Array of all trace entries
	 */
	getAllTraces(): TraceEntry[] {
		return Array.from(this.traces.values());
	}

	/**
	 * Filter traces by various criteria
	 * @param filter TraceFilter with optional criteria
	 * @returns Filtered array of trace entries
	 */
	filterTraces(filter: TraceFilter): TraceEntry[] {
		return this.getAllTraces().filter(trace => {
			// Filter by exact trace ID
			if (filter.traceId && trace.traceId !== filter.traceId) {
				return false;
			}

			// Filter by operation types
			if (filter.operationType && !filter.operationType.includes(trace.operationType)) {
				return false;
			}

			// Filter by status values
			if (filter.status && !filter.status.includes(trace.status)) {
				return false;
			}

			// Filter by time range
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

	/**
	 * Clear all traces (useful for cleanup after output)
	 */
	clear(): void {
		this.traces.clear();
	}

	/**
	 * Get count of collected traces
	 */
	count(): number {
		return this.traces.size;
	}
}
