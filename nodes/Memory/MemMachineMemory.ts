/**
 * MemMachine Memory Integration for n8n AI Agents
 * 
 * Provides conversation memory for AI Agents using MemMachine's cloud API as the storage backend.
 * Compatible with n8n's AI Agent memory interface without external dependencies.
 */

import { categorizeMemories, type EpisodicMemoryItem } from './utils/categorizeMemories';
import { renderTemplate, type ProfileMemoryFacts } from './utils/renderTemplate';
import { MemoryTracer } from './utils/tracer';

// Type definitions compatible with n8n AI Agent expectations
type InputValues = Record<string, any>;
type MemoryVariables = Record<string, any>;

interface BaseMessage {
  type: string;
  content: string;
  additional_kwargs?: Record<string, any>;
}

/**
 * Configuration interface for MemMachineMemory
 */
export interface MemMachineMemoryConfig {
  /** MemMachine API base URL */
  apiUrl: string;
  
  /** API authentication key (optional for local development) */
  apiKey?: string;
  
  /** Organization or group identifier */
  groupId: string;
  
  /** AI agent identifier(s) - array for multi-agent scenarios */
  agentId: string[];
  
  /** User identifier(s) - array for multi-user scenarios */
  userId: string[];
  
  /** Conversation session identifier for isolation */
  sessionId: string;
  
  /** Maximum number of recent messages to include in context window */
  contextWindowLength?: number;
  
  /** Enable formatted template output instead of raw messages */
  enableTemplate?: boolean;
  
  /** Template string for formatting memory context */
  contextTemplate?: string;
  
  /** Number of items to include in history section */
  historyCount?: number;
  
  /** Number of items to include in short-term memory section */
  shortTermCount?: number;
  
  /** Optional logger for debugging */
  logger?: {
    info: (message: string, ...args: any[]) => void;
    error: (message: string, ...args: any[]) => void;
    warn: (message: string, ...args: any[]) => void;
  };
  
  /** Optional tracer for distributed tracing (legacy) */
  tracer?: MemoryTracer;
  
  /** Optional cloud tracer for parent-child span relationships */
  cloudTracer?: MemoryTracer;
  
  /** Parent trace ID for linking child operations */
  parentTraceId?: string;
  
  /** Export traces to Jaeger endpoint (optional) */
  exportToJaeger?: boolean;
  
  /** Jaeger OTLP endpoint URL (optional) */
  jaegerEndpoint?: string;
}

/**
 * Memory implementation backed by MemMachine API
 * 
 * Provides the interface that n8n AI Agents expect for conversation history management.
 * Compatible with n8n's memory interface without external dependencies.
 */
export class MemMachineMemory {
  private config: MemMachineMemoryConfig;
  
  // Properties expected by n8n AI Agent memory interface
  public returnMessages = true;
  public inputKey = 'input';
  public outputKey = 'output';
  
  constructor(config: MemMachineMemoryConfig) {
    // Store MemMachine-specific configuration
    this.config = {
      ...config,
      contextWindowLength: config.contextWindowLength || 10, // Default to 10 messages
    };
    
    // Validate required configuration
    if (!this.config.sessionId) {
      throw new Error('MemMachineMemory requires a sessionId for conversation isolation');
    }
  }
  
  /**
   * Memory key for chat history (expected by n8n AI Agents)
   */
  get memoryKeys() {
    return ['chat_history'];
  }
  
  /**
   * Load conversation history from MemMachine API
   * Called by AI Agent before generating responses
   */
  async loadMemoryVariables(_values: InputValues): Promise<MemoryVariables> {
    // Start child span for load operation if cloud tracer is available
    let loadTraceId = '';
    if (this.config.cloudTracer && this.config.parentTraceId) {
      loadTraceId = this.config.cloudTracer.startOperation('retrieve', {
        operation: 'loadMemoryVariables',
        sessionId: this.config.sessionId,
        contextWindowLength: this.config.contextWindowLength,
      }, this.config.parentTraceId);
    }

    try {
      console.log('[MemMachineMemory] loadMemoryVariables - CALLED - Retrieving conversation history', {
        sessionId: this.config.sessionId,
        contextWindowLength: this.config.contextWindowLength,
      });
      this.config.logger?.info('loadMemoryVariables - Retrieving conversation history', {
        sessionId: this.config.sessionId,
        contextWindowLength: this.config.contextWindowLength,
      });

      // Build search request to MemMachine API
      const searchBody = {
        session: {
          group_id: this.config.groupId,
          agent_id: this.config.agentId,
          user_id: this.config.userId,
          session_id: this.config.sessionId,
        },
        query: '', // Empty query to get all memories
        limit: this.config.contextWindowLength,
        filter: {
          session_id: this.config.sessionId, // Filter by current session
          category: 'history', // Only get conversation history (not profile)
        },
      };

      const headers = {
        'Content-Type': 'application/json',
        'session-id': this.config.sessionId,
        ...(this.config.apiKey && { Authorization: `Bearer ${this.config.apiKey}` }),
      };

      // Start span for MemMachine search API call
      const searchSpan = this.config.tracer?.startSpan('memmachine.search', {
        attributes: {
          'http.method': 'POST',
          'http.url': `${this.config.apiUrl}/v1/memories/search`,
          'memmachine.session.id': this.config.sessionId,
          'memmachine.session.group_id': this.config.groupId,
          'memmachine.query.limit': this.config.contextWindowLength || 10,
        },
      });

      // Add event with request headers (sanitize auth)
      const sanitizedHeaders = { ...headers };
      if (sanitizedHeaders.Authorization) {
        sanitizedHeaders.Authorization = sanitizedHeaders.Authorization.substring(0, 15) + '***';
      }
      searchSpan && this.config.tracer?.addEvent(searchSpan, 'memmachine.search.headers', sanitizedHeaders);

      // Add event with request payload
      searchSpan && this.config.tracer?.addEvent(searchSpan, 'memmachine.search.payload', {
        'payload.session': JSON.stringify(searchBody.session),
        'payload.query': searchBody.query,
        'payload.limit': searchBody.limit || 10,
        'payload.filter': JSON.stringify(searchBody.filter),
      });

      // Add request send event with structured KV logs
      if (searchSpan && this.config.tracer) {
        // Log headers as individual key-value pairs
        const headerLogKV: Record<string, string | number | boolean> = {};
        for (const [key, value] of Object.entries(sanitizedHeaders)) {
          headerLogKV[`header.${key}`] = String(value);
        }
        
        this.config.tracer.addEvent(searchSpan, 'request.send', {
          'http.method': 'POST',
          'http.url': `${this.config.apiUrl}/v1/memories/search`,
          'http.target': '/v1/memories/search',
          ...headerLogKV,
          'body': JSON.stringify(searchBody),
        });
      }

      // Start nested cloud tracer span for the API call
      let apiCallTraceId = '';
      const requestBodyFormatted = JSON.stringify(searchBody, null, 2); // Pretty print
      const requestBody = JSON.stringify(searchBody); // Compact for actual request
      if (this.config.cloudTracer && loadTraceId) {
        apiCallTraceId = this.config.cloudTracer.startOperation('search', {
          operation: 'api_call_search',
          endpoint: '/v1/memories/search',
          sessionId: this.config.sessionId,
          'request.body': requestBodyFormatted,
          'request.body.size': requestBody.length,
        }, loadTraceId);
      }

      // Make request to MemMachine Search API
      const response = await fetch(`${this.config.apiUrl}/v1/memories/search`, {
        method: 'POST',
        headers,
        body: requestBody,
      });

      const data = await response.json() as { content?: { episodic_memory?: any[]; profile_memory?: any[] } };
      const apiResponseBody = JSON.stringify(data, null, 2); // Pretty print with 2-space indentation

      // Complete API call span
      if (apiCallTraceId && this.config.cloudTracer) {
        this.config.cloudTracer.completeOperation(apiCallTraceId, {
          success: response.ok,
          metadata: {
            'http.status_code': response.status,
            'http.status_text': response.statusText,
            'response.body': apiResponseBody.length > 1000 ? apiResponseBody.substring(0, 1000) + '...[truncated]' : apiResponseBody,
            'response.body.size': apiResponseBody.length,
          },
        });
      }

      // Add response status to span
      searchSpan && this.config.tracer?.addAttributes(searchSpan, {
        'http.status_code': response.status,
        'http.status_text': response.statusText,
      });

      if (!response.ok) {
        const error = new Error(`MemMachine API error: ${response.status} ${response.statusText}`);
        searchSpan && this.config.tracer?.endSpanWithError(searchSpan, error);
        throw error;
      }

      const responseBody = apiResponseBody;
      
      // Add response received event with structured KV logs
      if (searchSpan && this.config.tracer) {
        // Log response headers as individual key-value pairs
        const responseHeaderLogKV: Record<string, string | number | boolean> = {};
        response.headers.forEach((value, key) => {
          responseHeaderLogKV[`header.${key}`] = value;
        });
        
        this.config.tracer.addEvent(searchSpan, 'response.received', {
          'http.status_code': response.status,
          'http.status_text': response.statusText,
          ...responseHeaderLogKV,
          'body': responseBody.length > 5000 ? responseBody.substring(0, 5000) + '...[truncated]' : responseBody,
          'body.size': responseBody.length,
        });
      }
      
      // Extract and process memories
      const content = data.content || {};
      const rawEpisodicMemory = content.episodic_memory || [];
      const rawProfileMemory = content.profile_memory || [];
      
      // Add response metrics to span
      searchSpan && this.config.tracer?.addAttributes(searchSpan, {
        'memmachine.response.episodic_count': Array.isArray(rawEpisodicMemory) ? rawEpisodicMemory.length : 0,
        'memmachine.response.profile_count': Array.isArray(rawProfileMemory) ? rawProfileMemory.length : 0,
      });

      // Start nested cloud tracer span for memory processing
      let processingTraceId = '';
      if (this.config.cloudTracer && loadTraceId) {
        processingTraceId = this.config.cloudTracer.startOperation('enrich', {
          operation: 'process_memories',
          episodicCount: Array.isArray(rawEpisodicMemory) ? rawEpisodicMemory.length : 0,
          profileCount: Array.isArray(rawProfileMemory) ? rawProfileMemory.length : 0,
          templateEnabled: this.config.enableTemplate,
        }, loadTraceId);
      }
      
      // If template is enabled, return formatted context as system message
      if (this.config.enableTemplate && this.config.contextTemplate) {
        const result = this.formatTemplatedMemory(rawEpisodicMemory, rawProfileMemory);
        
        // Complete processing span
        if (processingTraceId && this.config.cloudTracer) {
          this.config.cloudTracer.completeOperation(processingTraceId, {
            success: true,
            metadata: {
              operation: 'format_template',
              outputLength: result.chat_history?.[0]?.content?.length || 0,
            },
          });
        }
        
        return result;
      }
      
      // Otherwise, return raw messages for standard LangChain flow
      const messages: BaseMessage[] = [];
      
      if (Array.isArray(rawEpisodicMemory)) {
        for (const group of rawEpisodicMemory) {
          if (Array.isArray(group)) {
            for (const item of group) {
              if (item && item.content && item.content.trim() !== '') {
                // Determine if this is a user message or agent message based on producer
                const isUserMessage = this.config.userId.includes(item.producer_id);
                
                if (isUserMessage) {
                  messages.push({
                    type: 'human',
                    content: item.content,
                    additional_kwargs: {},
                  } as BaseMessage);
                } else {
                  messages.push({
                    type: 'ai',
                    content: item.content,
                    additional_kwargs: {},
                  } as BaseMessage);
                }
              }
            }
          }
        }
      }

      // Sort by timestamp if available, otherwise maintain order
      // Limit to contextWindowLength most recent messages
      const recentMessages = messages.slice(-this.config.contextWindowLength!);

      this.config.logger?.info('loadMemoryVariables - Retrieved messages', {
        totalMessages: messages.length,
        recentMessages: recentMessages.length,
      });

      // Complete processing span for non-template path
      if (processingTraceId && this.config.cloudTracer) {
        this.config.cloudTracer.completeOperation(processingTraceId, {
          success: true,
          metadata: {
            operation: 'process_raw_messages',
            messagesTotal: messages.length,
            messagesReturned: recentMessages.length,
          },
        });
      }

      // End search span successfully
      searchSpan && this.config.tracer?.addAttributes(searchSpan, {
        'memmachine.messages.total': messages.length,
        'memmachine.messages.returned': recentMessages.length,
      });
      searchSpan && this.config.tracer?.endSpan(searchSpan);

      // Complete cloud tracer child span on success
      if (loadTraceId && this.config.cloudTracer) {
        this.config.cloudTracer.completeOperation(loadTraceId, {
          success: true,
          metadata: {
            operation: 'loadMemoryVariables',
            messagesTotal: messages.length,
            messagesReturned: recentMessages.length,
            sessionId: this.config.sessionId,
          },
        });

        // Export traces to Jaeger after child operation completes
        if (this.config.exportToJaeger && this.config.jaegerEndpoint) {
          this.config.cloudTracer.exportTracesToJaeger(this.config.jaegerEndpoint).catch((error: Error) => {
            console.error('[MemMachineMemory] Failed to export traces after loadMemoryVariables:', error);
          });
        }
      }

      return {
        chat_history: recentMessages,
      };
    } catch (error) {
      // Complete cloud tracer child span on error
      if (loadTraceId && this.config.cloudTracer) {
        this.config.cloudTracer.completeOperation(loadTraceId, {
          success: false,
          error: (error as Error).message,
          metadata: {
            operation: 'loadMemoryVariables',
            sessionId: this.config.sessionId,
          },
        });

        // Export traces to Jaeger even on error
        if (this.config.exportToJaeger && this.config.jaegerEndpoint) {
          this.config.cloudTracer.exportTracesToJaeger(this.config.jaegerEndpoint).catch((exportError: Error) => {
            console.error('[MemMachineMemory] Failed to export traces after loadMemoryVariables error:', exportError);
          });
        }
      }

      // Graceful degradation - log error and return empty history
      this.config.logger?.error('loadMemoryVariables - Failed to retrieve history', {
        error: (error as Error).message,
        sessionId: this.config.sessionId,
      });
      
      // Return empty history so conversation can continue
      return {
        chat_history: [] as BaseMessage[],
      };
    }
  }
  
  /**
   * Save conversation turn to MemMachine API
   * Called by AI Agent after generating response
   */
  async saveContext(inputValues: InputValues, outputValues: InputValues): Promise<void> {
    // Start child span for save operation if cloud tracer is available
    let saveTraceId = '';
    if (this.config.cloudTracer && this.config.parentTraceId) {
      saveTraceId = this.config.cloudTracer.startOperation('store', {
        operation: 'saveContext',
        sessionId: this.config.sessionId,
      }, this.config.parentTraceId);
    }

    try {
      const userMessage = inputValues.input as string;
      const agentResponse = outputValues.output as string;

      console.log('[MemMachineMemory] saveContext - CALLED - Storing conversation turn', {
        sessionId: this.config.sessionId,
        userMessageLength: userMessage?.length || 0,
        agentResponseLength: agentResponse?.length || 0,
      });
      this.config.logger?.info('saveContext - Storing conversation turn', {
        sessionId: this.config.sessionId,
        userMessageLength: userMessage?.length || 0,
        agentResponseLength: agentResponse?.length || 0,
      });

      // Store user message first
      if (userMessage) {
        await this.storeMessage(
          userMessage,
          this.config.userId[0], // User is the producer
          this.config.agentId[0], // Agent is the recipient
          saveTraceId, // Pass parent trace ID for nested span
          'user_message',
        );
      }

      // Store agent response
      if (agentResponse) {
        await this.storeMessage(
          agentResponse,
          this.config.agentId[0], // Agent is the producer
          this.config.userId[0], // User is the recipient
          saveTraceId, // Pass parent trace ID for nested span
          'agent_response',
        );
      }

      this.config.logger?.info('saveContext - Successfully stored conversation turn');

      // Complete cloud tracer child span on success
      if (saveTraceId && this.config.cloudTracer) {
        this.config.cloudTracer.completeOperation(saveTraceId, {
          success: true,
          metadata: {
            operation: 'saveContext',
            userMessageLength: inputValues.input ? String(inputValues.input).length : 0,
            agentResponseLength: outputValues.output ? String(outputValues.output).length : 0,
            sessionId: this.config.sessionId,
          },
        });

        // Export traces to Jaeger after child operation completes
        if (this.config.exportToJaeger && this.config.jaegerEndpoint) {
          this.config.cloudTracer.exportTracesToJaeger(this.config.jaegerEndpoint).catch((error: Error) => {
            console.error('[MemMachineMemory] Failed to export traces after saveContext:', error);
          });
        }
      }
    } catch (error) {
      // Complete cloud tracer child span on error
      if (saveTraceId && this.config.cloudTracer) {
        this.config.cloudTracer.completeOperation(saveTraceId, {
          success: false,
          error: (error as Error).message,
          metadata: {
            operation: 'saveContext',
            sessionId: this.config.sessionId,
          },
        });

        // Export traces to Jaeger even on error
        if (this.config.exportToJaeger && this.config.jaegerEndpoint) {
          this.config.cloudTracer.exportTracesToJaeger(this.config.jaegerEndpoint).catch((exportError: Error) => {
            console.error('[MemMachineMemory] Failed to export traces after saveContext error:', exportError);
          });
        }
      }

      // Graceful degradation - log error but don't throw
      // This allows the conversation to continue even if storage fails
      this.config.logger?.error('saveContext - Failed to store conversation', {
        error: (error as Error).message,
        sessionId: this.config.sessionId,
      });
    }
  }

  /**
   * Helper method to store a single message in MemMachine
   */
  private async storeMessage(
    content: string,
    producer: string,
    producedFor: string,
    parentTraceId: string = '',
    messageType: string = 'message',
  ): Promise<void> {
    const storeBody = {
      session: {
        group_id: this.config.groupId,
        agent_id: this.config.agentId,
        user_id: this.config.userId,
        session_id: this.config.sessionId,
      },
      producer,
      produced_for: producedFor,
      episode_content: content,
      episode_type: 'dialog',
      metadata: {
        category: 'history', // Mark as conversation history
        timestamp: new Date().toISOString(),
      },
    };

    const headers = {
      'Content-Type': 'application/json',
      'session-id': this.config.sessionId,
      ...(this.config.apiKey && { Authorization: `Bearer ${this.config.apiKey}` }),
    };

    // Start span for MemMachine store API call
    const storeSpan = this.config.tracer?.startSpan('memmachine.store', {
      attributes: {
        'http.method': 'POST',
        'http.url': `${this.config.apiUrl}/v1/memories`,
        'memmachine.session.id': this.config.sessionId,
        'memmachine.session.group_id': this.config.groupId,
        'memmachine.message.producer': producer,
        'memmachine.message.produced_for': producedFor,
        'memmachine.message.length': content.length,
        'memmachine.episode.type': 'dialog',
      },
    });

    // Add event with request headers (sanitize auth)
    const sanitizedHeaders = { ...headers };
    if (sanitizedHeaders.Authorization) {
      sanitizedHeaders.Authorization = sanitizedHeaders.Authorization.substring(0, 15) + '***';
    }
    storeSpan && this.config.tracer?.addEvent(storeSpan, 'memmachine.store.headers', sanitizedHeaders);

    // Add event with request payload (truncate content if too long)
    storeSpan && this.config.tracer?.addEvent(storeSpan, 'memmachine.store.payload', {
      'payload.session': JSON.stringify(storeBody.session),
      'payload.producer': producer,
      'payload.produced_for': producedFor,
      'payload.episode_content': content.length > 200 ? content.substring(0, 200) + '...' : content,
      'payload.episode_type': storeBody.episode_type,
      'payload.metadata': JSON.stringify(storeBody.metadata),
    });

    // Add request send event with structured KV logs
    if (storeSpan && this.config.tracer) {
      // Log headers as individual key-value pairs
      const headerLogKV: Record<string, string | number | boolean> = {};
      for (const [key, value] of Object.entries(sanitizedHeaders)) {
        headerLogKV[`header.${key}`] = String(value);
      }
      
      this.config.tracer.addEvent(storeSpan, 'request.send', {
        'http.method': 'POST',
        'http.url': `${this.config.apiUrl}/v1/memories`,
        'http.target': '/v1/memories',
        ...headerLogKV,
        'body': JSON.stringify(storeBody),
      });
    }

    // Start nested cloud tracer span for the API call
    let apiStoreTraceId = '';
    const storeRequestBodyFormatted = JSON.stringify(storeBody, null, 2); // Pretty print
    const storeRequestBody = JSON.stringify(storeBody); // Compact for actual request
    if (this.config.cloudTracer && parentTraceId) {
      apiStoreTraceId = this.config.cloudTracer.startOperation('store', {
        operation: `api_call_store_${messageType}`,
        endpoint: '/v1/memories',
        producer,
        messageLength: content.length,
        'request.body': storeRequestBodyFormatted.length > 500 ? storeRequestBodyFormatted.substring(0, 500) + '...[truncated]' : storeRequestBodyFormatted,
        'request.body.size': storeRequestBody.length,
      }, parentTraceId);
    }

    const response = await fetch(`${this.config.apiUrl}/v1/memories`, {
      method: 'POST',
      headers,
      body: storeRequestBody,
    });

    const responseText = await response.clone().text();
    
    // Try to parse and pretty-print response if it's JSON
    let formattedResponse = responseText;
    try {
      const parsed = JSON.parse(responseText);
      formattedResponse = JSON.stringify(parsed, null, 2);
    } catch (e) {
      // Not JSON or empty, use as-is
    }

    // Complete API store span
    if (apiStoreTraceId && this.config.cloudTracer) {
      this.config.cloudTracer.completeOperation(apiStoreTraceId, {
        success: response.ok,
        metadata: {
          'http.status_code': response.status,
          'http.status_text': response.statusText,
          messageType,
          'response.body': formattedResponse.length > 500 ? formattedResponse.substring(0, 500) + '...[truncated]' : formattedResponse,
          'response.body.size': responseText.length,
        },
      });
    }

    // Add response status to span
    storeSpan && this.config.tracer?.addAttributes(storeSpan, {
      'http.status_code': response.status,
      'http.status_text': response.statusText,
    });

    // Add response received event with structured KV logs
    if (storeSpan && this.config.tracer) {
      // Log response headers as individual key-value pairs
      const responseHeaderLogKV: Record<string, string | number | boolean> = {};
      response.headers.forEach((value, key) => {
        responseHeaderLogKV[`header.${key}`] = value;
      });
      
      this.config.tracer.addEvent(storeSpan, 'response.received', {
        'http.status_code': response.status,
        'http.status_text': response.statusText,
        ...responseHeaderLogKV,
        'body': responseText || '(empty)',
        'body.size': responseText.length,
      });
    }

    if (!response.ok) {
      const error = new Error(`MemMachine Store API error: ${response.status} ${response.statusText}`);
      storeSpan && this.config.tracer?.endSpanWithError(storeSpan, error);
      throw error;
    }

    // End store span successfully
    storeSpan && this.config.tracer?.endSpan(storeSpan);
  }

  /**
   * Format memory using template and return as system message
   */
  private formatTemplatedMemory(rawEpisodicMemory: any[], rawProfileMemory: any[]): MemoryVariables {
    console.log('[MemMachineMemory] Formatting templated memory', {
      episodicCount: rawEpisodicMemory.length,
      profileCount: rawProfileMemory.length,
    });

    // Flatten and transform episodic memories to expected structure
    const flattenedMemories: EpisodicMemoryItem[] = [];
    if (Array.isArray(rawEpisodicMemory)) {
      for (const group of rawEpisodicMemory) {
        if (Array.isArray(group)) {
          for (const item of group) {
            if (item && typeof item === 'object' && item.content && item.content.trim() !== '') {
              flattenedMemories.push({
                episode_content: item.content,
                producer: item.producer_id || 'unknown',
                produced_for: item.produced_for_id || 'unknown',
                episode_type: item.episode_type || 'dialog',
                timestamp: item.timestamp,
                uuid: item.uuid,
                content_type: item.content_type,
                group_id: item.group_id,
                session_id: item.session_id,
                user_metadata: item.user_metadata,
              });
            }
          }
        }
      }
    }

    // Transform profile memory to expected structure
    const profileMemoryFacts: any[] = [];
    if (Array.isArray(rawProfileMemory)) {
      for (const item of rawProfileMemory) {
        if (item && typeof item === 'object') {
          profileMemoryFacts.push({
            subject: item.tag || 'General',
            predicate: item.feature || 'property',
            object: item.value || '',
            confidence: item.metadata?.similarity_score,
            source: `id_${item.metadata?.id}`,
          });
        }
      }
    }

    const profileMemory: ProfileMemoryFacts = {
      facts: profileMemoryFacts,
      entities: {},
    };

    // Categorize memories into temporal arrays
    const historyCount = this.config.historyCount || 5;
    const shortTermCount = this.config.shortTermCount || 10;
    const categorized = categorizeMemories(flattenedMemories, historyCount, shortTermCount);

    // Render template
    const contextText = renderTemplate(
      this.config.contextTemplate!,
      categorized,
      profileMemory,
    );

    console.log('[MemMachineMemory] Templated context length:', contextText.length);

    // Return formatted context as a system message (n8n compatible format)
    return {
      chat_history: [
        {
          type: 'system',
          content: contextText,
          additional_kwargs: {},
        } as BaseMessage,
      ],
    };
  }
}
