/**
 * TypeScript Type Definitions for n8n Cloud Compliant Tracing
 * 
 * Feature: 006-n8n-compliant-tracing
 * Specification: specs/006-n8n-compliant-tracing/spec.md
 * Data Model: specs/006-n8n-compliant-tracing/data-model.md
 * 
 * These types define the contract for trace data structures used throughout
 * the tracing implementation. All types are designed for n8n Cloud compliance
 * (no external dependencies, no Node.js built-ins beyond standard runtime).
 */

/**
 * Operation types supported by MemMachine memory node
 */
export type OperationType = 'store' | 'retrieve' | 'search' | 'enrich';

/**
 * Trace entry lifecycle status
 */
export type TraceStatus = 'started' | 'success' | 'failure';

/**
 * Error classification categories
 */
export type ErrorType = 'network' | 'validation' | 'authentication' | 'timeout' | 'unexpected';

/**
 * Core trace entry representing a single traced operation
 */
export interface TraceEntry {
	/** Unique identifier (UUID v4) for this trace */
	traceId: string;
	
	/** Parent trace ID for nested operations (optional) */
	parentTraceId?: string;
	
	/** Operation start timestamp (ISO 8601 format) */
	timestamp: string;
	
	/** Type of memory operation being traced */
	operationType: OperationType;
	
	/** Current status of the operation */
	status: TraceStatus;
	
	/** Execution duration in milliseconds (only present when status !== 'started') */
	duration?: number;
	
	/** Operation-specific contextual data */
	metadata: TraceMetadata;
	
	/** Error details (only present when status === 'failure') */
	error?: ErrorContext;
	
	/** Truncation information (only present if entry was truncated) */
	_truncated?: TruncationInfo;
}

/**
 * Operation-specific metadata attached to trace entries
 */
export interface TraceMetadata {
	/** API endpoint called (relative path) */
	apiEndpoint: string;
	
	/** Workflow item index being processed (optional) */
	itemIndex?: number;
	
	/** Number of memories involved in operation */
	memoryCount?: number;
	
	/** Distribution of memories by category */
	categoryDistribution?: Record<string, number>;
	
	/** API response size in bytes */
	responseSize?: number;
	
	/** Query parameters for retrieve operations (sanitized) */
	queryParams?: Record<string, any>;
	
	/** Search query text for search operations */
	searchQuery?: string;
	
	/** Number of candidate memories evaluated (search) */
	candidateCount?: number;
	
	/** Number of memories selected for output (search) */
	selectedCount?: number;
	
	/** Relevance scores for search results (top N only) */
	relevanceScores?: number[];
	
	/** Template identifier used for enrichment */
	templateUsed?: string;
	
	/** Memories input to enrichment operation */
	inputMemoryCount?: number;
	
	/** Enriched output size in bytes */
	outputSize?: number;
	
	/** Time spent in template rendering (ms) */
	enrichmentTimeMs?: number;
	
	/** Additional operation-specific fields */
	[key: string]: any;
}

/**
 * Structured error information for failed operations
 */
export interface ErrorContext {
	/** Error classification category */
	type: ErrorType;
	
	/** Human-readable error message (sanitized) */
	message: string;
	
	/** Error code from API or system (optional) */
	code?: string;
	
	/** Additional debugging context (sanitized) */
	context?: Record<string, any>;
	
	/** Stack trace limited to application code (optional) */
	stack?: string;
}

/**
 * Metadata indicating trace entry was truncated
 */
export interface TruncationInfo {
	/** Original entry size in bytes before truncation */
	original_size: number;
	
	/** Final entry size in bytes after truncation */
	truncated_to: number;
	
	/** When truncation occurred (ISO 8601) */
	timestamp: string;
	
	/** Truncation strategy used (for debugging) */
	strategy?: string;
}

/**
 * Rule for identifying and sanitizing sensitive data
 */
export interface SanitizationRule {
	/** Rule identifier for debugging */
	name: string;
	
	/** Regex pattern to match sensitive field names */
	fieldPattern?: RegExp;
	
	/** Regex pattern to match sensitive field values */
	valuePattern?: RegExp;
	
	/** Replacement text for matched sensitive data */
	replacement: string;
}

/**
 * Query parameters for filtering traces
 */
export interface TraceFilter {
	/** Filter by exact trace ID */
	traceId?: string;
	
	/** Filter by operation types */
	operationType?: OperationType[];
	
	/** Filter by status values */
	status?: TraceStatus[];
	
	/** Filter by timestamp range */
	timeRange?: TimeRange;
}

/**
 * Time range for filtering traces
 */
export interface TimeRange {
	/** Start time (ISO 8601) */
	start: string;
	
	/** End time (ISO 8601) */
	end: string;
}

/**
 * Configuration options for tracing behavior
 */
export interface TracingConfig {
	/** Enable or disable tracing */
	enabled: boolean;
	
	/** Output format for traces */
	format: 'json' | 'human';
	
	/** Verbosity level (controls metadata detail) */
	verbosity: 'minimal' | 'normal' | 'verbose';
	
	/** Maximum size per trace entry in bytes */
	maxEntrySize: number;
	
	/** Sanitization rules to apply */
	sanitizationRules?: SanitizationRule[];
}

/**
 * Configuration for truncation behavior
 */
export interface TruncationConfig {
	/** Maximum size in bytes */
	maxSize: number;
	
	/** Fields that must always be preserved */
	criticalFields: string[];
	
	/** Size threshold for field summarization */
	summarizeThreshold: number;
}
