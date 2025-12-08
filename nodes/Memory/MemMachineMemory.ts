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
  
  /** V2 API - Organization identifier (required) */
  orgId: string;
  
  /** V2 API - Project identifier (required) */
  projectId: string;
  
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
    // T010: Validate v2 API required fields (FR-012)
    if (!config.orgId || config.orgId.trim() === '') {
      throw new Error('MemMachine API v2 requires organization ID (orgId)');
    }
    if (!config.projectId || config.projectId.trim() === '') {
      throw new Error('MemMachine API v2 requires project ID (projectId)');
    }
    
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
      // Extract query from input values (usually 'input' key)
      const query = _values[this.inputKey] || _values.input || '';

      this.config.logger?.info('loadMemoryVariables - Retrieving conversation history', {
        sessionId: this.config.sessionId,
        contextWindowLength: this.config.contextWindowLength,
      });

      // T027-T028: Build v2 search request with org_id/project_id
      const searchBody = {
        org_id: this.config.orgId,
        project_id: this.config.projectId,
        query: query, // Use user input as query for semantic search
        top_k: this.config.contextWindowLength,
        types: [], // Empty array to get all memory types (episodic + semantic)
        // filter: Removed as per user feedback
      };

      // DEBUG: Log request body
      console.log('[MemMachineMemory] DEBUG - Search Body:', JSON.stringify(searchBody, null, 2));
      this.config.logger?.info('[MemMachineMemory] DEBUG - Search Body', searchBody);

      const headers = {
        'Content-Type': 'application/json',
        ...(this.config.apiKey && { Authorization: `Bearer ${this.config.apiKey}` }),
      };

      // Start span for MemMachine search API call
      const searchSpan = this.config.tracer?.startSpan('memmachine.search', {
        attributes: {
          'http.method': 'POST',
          'http.url': `${this.config.apiUrl}/api/v2/memories/search`,
          'memmachine.session.id': this.config.sessionId,
          'memmachine.session.group_id': this.config.groupId,
          'memmachine.query.top_k': this.config.contextWindowLength || 10,
          'memmachine.query.types': JSON.stringify(['episodic']),
        },
      });

      // Add event with request headers (sanitize auth)
      const sanitizedHeaders = { ...headers };
      if (sanitizedHeaders.Authorization) {
        sanitizedHeaders.Authorization = sanitizedHeaders.Authorization.substring(0, 15) + '***';
      }
      void (searchSpan && this.config.tracer?.addEvent(searchSpan, 'memmachine.search.headers', sanitizedHeaders));

      // Add event with v2 request payload
      void (searchSpan && this.config.tracer?.addEvent(searchSpan, 'memmachine.search.payload', {
        'payload.org_id': searchBody.org_id,
        'payload.project_id': searchBody.project_id,
        'payload.query': searchBody.query,
        'payload.top_k': searchBody.top_k || 10,
        'payload.types': JSON.stringify(searchBody.types),
      }));

      // Add request send event with structured KV logs
      if (searchSpan && this.config.tracer) {
        // Log headers as individual key-value pairs
        const headerLogKV: Record<string, string | number | boolean> = {};
        for (const [key, value] of Object.entries(sanitizedHeaders)) {
          headerLogKV[`header.${key}`] = String(value);
        }
        
        this.config.tracer.addEvent(searchSpan, 'request.send', {
          'http.method': 'POST',
          'http.url': `${this.config.apiUrl}/api/v2/memories/search`,
          'http.target': '/api/v2/memories/search',
          ...headerLogKV,
          'body': JSON.stringify(searchBody),
        });
      }

      // T035: Start nested cloud tracer span for the API call
      let apiCallTraceId = '';
      const requestBodyFormatted = JSON.stringify(searchBody, null, 2); // Pretty print
      const requestBody = JSON.stringify(searchBody); // Compact for actual request
      if (this.config.cloudTracer && loadTraceId) {
        apiCallTraceId = this.config.cloudTracer.startOperation('search', {
          operation: 'api_call_search',
          endpoint: '/api/v2/memories/search',
          sessionId: this.config.sessionId,
          'request.body': requestBodyFormatted,
          'request.body.size': requestBody.length,
        }, loadTraceId);
      }

      // T026: Make request to MemMachine v2 Search API
      const response = await fetch(`${this.config.apiUrl}/api/v2/memories/search`, {
        method: 'POST',
        headers,
        body: requestBody,
      });

      // Read response body once
      const responseText = await response.text();
      let data: any = {};
      
      try {
        data = JSON.parse(responseText);
      } catch (e) {
        // Not JSON
      }
      
      const apiResponseBody = JSON.stringify(data, null, 2);

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
      
      // DEBUG: Log successful response body to debug data format issues
      if (response.ok) {
        console.log('[MemMachineMemory] DEBUG - Search API Success Response:', apiResponseBody);
      }

      if (!response.ok) {
        console.error('[MemMachineMemory] DEBUG - Search API Error:', {
          status: response.status,
          statusText: response.statusText,
          body: responseText // Log the raw text
        });
        
        const error = new Error(`MemMachine API error: ${response.status} ${response.statusText} - ${responseText}`);
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
      
      // T029-T030: Extract and process v2 memories (handle both flat and nested formats)
      let rawMemories: any[] = [];
      let rawEpisodicMemory: any[] = [];
      let rawProfileMemory: any[] = [];
      let rawSemanticMemory: any[] = [];
      let episodeSummary: string[] = [];
      
      // Check if response has flat memories array (documented v2 format)
      if (data.memories && Array.isArray(data.memories)) {
        rawMemories = data.memories;
        rawEpisodicMemory = rawMemories.filter((m: any) => m.type === 'episodic');
        rawProfileMemory = rawMemories.filter((m: any) => m.type === 'profile');
      }
      // Check if response has nested content structure (actual API response)
      else if (data.content && typeof data.content === 'object') {
        const content = data.content as any;
        
        // Extract episodic memories from nested structure
        if (content.episodic_memory) {
          const episodicMem = content.episodic_memory;
          
          // Collect episodes from short_term_memory
          if (episodicMem.short_term_memory?.episodes) {
            rawEpisodicMemory.push(...episodicMem.short_term_memory.episodes);
          }
          
          // Extract episode summaries from short_term_memory
          if (episodicMem.short_term_memory?.episode_summary && Array.isArray(episodicMem.short_term_memory.episode_summary)) {
            episodeSummary = episodicMem.short_term_memory.episode_summary.filter((s: string) => s && s.trim() !== '');
          }
          
          // Collect episodes from long_term_memory
          if (episodicMem.long_term_memory?.episodes) {
            rawEpisodicMemory.push(...episodicMem.long_term_memory.episodes);
          }
        }
        
        // Extract semantic/profile memories
        if (content.semantic_memory && Array.isArray(content.semantic_memory)) {
          rawSemanticMemory = content.semantic_memory;
          rawProfileMemory = content.semantic_memory; // Legacy compatibility
        }
        
        rawMemories = [...rawEpisodicMemory, ...rawSemanticMemory];
      }

      // DEBUG: Log extracted memory counts
      console.log(`[MemMachineMemory] DEBUG - Extracted Memories: Total=${rawMemories.length}, Episodic=${rawEpisodicMemory.length}, Semantic=${rawSemanticMemory.length}`);
      
      // Add response metrics to span
      searchSpan && this.config.tracer?.addAttributes(searchSpan, {
        'memmachine.response.total_count': rawMemories.length,
        'memmachine.response.episodic_count': rawEpisodicMemory.length,
        'memmachine.response.semantic_count': rawSemanticMemory.length,
        'memmachine.response.profile_count': rawProfileMemory.length,
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
        const result = this.formatTemplatedMemory(rawEpisodicMemory, rawProfileMemory, rawSemanticMemory, episodeSummary);
        
        const renderedContent = result.chat_history?.[0]?.content || '';
        
        // Complete processing span
        if (processingTraceId && this.config.cloudTracer) {
          this.config.cloudTracer.completeOperation(processingTraceId, {
            success: true,
            metadata: {
              operation: 'format_template',
              outputLength: renderedContent.length,
              renderedContext: renderedContent.length > 2000 ? renderedContent.substring(0, 2000) + '\n\n...[truncated]' : renderedContent,
            },
          });
        }
        
        return result;
      }
      
      // T030: Otherwise, return raw messages for standard LangChain flow (v2 format)
      const messages: BaseMessage[] = [];
      
      if (Array.isArray(rawEpisodicMemory)) {
        for (const memory of rawEpisodicMemory) {
          // Handle flat structure (MemMachine V2 actual response)
          if (memory && memory.content && typeof memory.content === 'string' && memory.content.trim() !== '') {
             const content = memory.content;
             const producer = memory.producer_id || memory.producer || '';
             
             // Determine if this is a user message or agent message based on producer
             // Check against configured userId array
             const isUserMessage = this.config.userId.some((uid: string) => 
               producer && producer.includes(uid)
             ) || (memory.producer_role === 'user'); // Also check role if available
             
             if (isUserMessage) {
               messages.push({
                 type: 'human',
                 content: content,
                 additional_kwargs: {},
               } as BaseMessage);
             } else {
               messages.push({
                 type: 'ai',
                 content: content,
                 additional_kwargs: {},
               } as BaseMessage);
             }
          }
          // Handle nested structure (Legacy/Alternative format)
          else if (memory && Array.isArray(memory.messages) && memory.messages.length > 0) {
            const message = memory.messages[0];
            if (message.content && message.content.trim() !== '') {
              // Determine if this is a user message or agent message based on producer
              const isUserMessage = this.config.userId.some((uid: string) => 
                message.producer && message.producer.includes(uid)
              );
              
              if (isUserMessage) {
                messages.push({
                  type: 'human',
                  content: message.content,
                  additional_kwargs: {},
                } as BaseMessage);
              } else {
                messages.push({
                  type: 'ai',
                  content: message.content,
                  additional_kwargs: {},
                } as BaseMessage);
              }
            }
          }
        }
      }

      // Sort by timestamp if available, otherwise maintain order
      // Limit to contextWindowLength most recent messages
      const recentMessages = messages.slice(-this.config.contextWindowLength!);

      console.log(`[MemMachineMemory] DEBUG - Final Messages: Total=${messages.length}, Returned=${recentMessages.length}`);

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
    // T032-T034: Build v2 store request with messages array
    const storeBody = {
      org_id: this.config.orgId,
      project_id: this.config.projectId,
      messages: [
        {
          content,
          producer,
          produced_for: producedFor,
          role: producer.includes('agent') ? 'assistant' : 'user',
          metadata: {
            // agent_id and user_id removed as requested
            session_id: this.config.sessionId,
            category: 'history',
            timestamp: new Date().toISOString(),
          },
        },
      ],
    };

    // DEBUG: Log store body
    console.log('[MemMachineMemory] DEBUG - Store Body:', JSON.stringify(storeBody, null, 2));
    this.config.logger?.info('[MemMachineMemory] DEBUG - Store Body', storeBody);

    const headers = {
      'Content-Type': 'application/json',
      ...(this.config.apiKey && { Authorization: `Bearer ${this.config.apiKey}` }),
    };

    // T035: Start span for MemMachine store API call with v2 endpoint
    const storeSpan = this.config.tracer?.startSpan('memmachine.store', {
      attributes: {
        'http.method': 'POST',
        'http.url': `${this.config.apiUrl}/api/v2/memories`,
        'memmachine.session.id': this.config.sessionId,
        'memmachine.org_id': this.config.orgId,
        'memmachine.project_id': this.config.projectId,
        'memmachine.message.producer': producer,
        'memmachine.message.produced_for': producedFor,
        'memmachine.message.length': content.length,
      },
    });

    // Add event with request headers (sanitize auth)
    const sanitizedHeaders = { ...headers };
    if (sanitizedHeaders.Authorization) {
      sanitizedHeaders.Authorization = sanitizedHeaders.Authorization.substring(0, 15) + '***';
    }
    storeSpan && this.config.tracer?.addEvent(storeSpan, 'memmachine.store.headers', sanitizedHeaders);

    // Add event with v2 request payload (truncate content if too long)
    storeSpan && this.config.tracer?.addEvent(storeSpan, 'memmachine.store.payload', {
      'payload.org_id': this.config.orgId,
      'payload.project_id': this.config.projectId,
      'payload.messages[0].producer': producer,
      'payload.messages[0].produced_for': producedFor,
      'payload.messages[0].content': content.length > 200 ? content.substring(0, 200) + '...' : content,
      'payload.messages[0].role': storeBody.messages[0].role,
      'payload.messages[0].metadata': JSON.stringify(storeBody.messages[0].metadata),
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
        'http.url': `${this.config.apiUrl}/api/v2/memories`,
        'http.target': '/api/v2/memories',
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
        endpoint: '/api/v2/memories',
        producer,
        messageLength: content.length,
        'request.body': storeRequestBodyFormatted.length > 500 ? storeRequestBodyFormatted.substring(0, 500) + '...[truncated]' : storeRequestBodyFormatted,
        'request.body.size': storeRequestBody.length,
      }, parentTraceId);
    }

    // T031: Make request to v2 Store API with auto-creation on 404
    let response = await fetch(`${this.config.apiUrl}/api/v2/memories`, {
      method: 'POST',
      headers,
      body: storeRequestBody,
    });

    // T048-T051: Auto-create project if 404 error
    if (!response.ok && response.status === 404) {
      const errorText = await response.clone().text();
      if (errorText.toLowerCase().includes('project')) {
        // Project not found, will auto-create with default configuration
        
        // T050: Create project with default configuration
        const createProjectResponse = await fetch(`${this.config.apiUrl}/api/v2/projects`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            org_id: this.config.orgId,
            project_id: this.config.projectId,
            description: 'Auto-created by n8n workflow',
            config: {
              reranker: 'default',
              embedder: 'default',
            },
          }),
        });

        // T050: Treat 409 Conflict as success (idempotency)
        if (createProjectResponse.ok || createProjectResponse.status === 409) {
          // Project created or already exists, retrying store operation
          
          // T051: Retry original store operation
          response = await fetch(`${this.config.apiUrl}/api/v2/memories`, {
            method: 'POST',
            headers,
            body: storeRequestBody,
          });
        } else {
          const createErrorText = await createProjectResponse.text();
          throw new Error(`Failed to auto-create project: ${createProjectResponse.status} ${createErrorText}`);
        }
      }
    }

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
      // Note: 404 check is handled above, this is for other errors
      // responseText was already read above from clone
      console.error('[MemMachineMemory] DEBUG - Store API Error:', {
        status: response.status,
        statusText: response.statusText,
        body: responseText
      });

      const error = new Error(`MemMachine Store API error: ${response.status} ${response.statusText} - ${responseText}`);
      storeSpan && this.config.tracer?.endSpanWithError(storeSpan, error);
      throw error;
    }

    // End store span successfully
    storeSpan && this.config.tracer?.endSpan(storeSpan);
  }

  /**
   * Format memory using template and return as system message
   */
  private formatTemplatedMemory(rawEpisodicMemory: any[], rawProfileMemory: any[], rawSemanticMemory: any[], episodeSummary: string[]): MemoryVariables {
    console.log('[MemMachineMemory] Formatting templated memory', {
      episodicCount: rawEpisodicMemory.length,
      profileCount: rawProfileMemory.length,
      semanticCount: rawSemanticMemory.length,
      summaryCount: episodeSummary.length,
    });

    // Flatten and transform episodic memories to expected structure with deduplication
    const flattenedMemories: EpisodicMemoryItem[] = [];
    const seenEpisodes = new Set<string>();
    
    console.log('[MemMachineMemory] DEBUG - Processing episodic memories. Raw count:', rawEpisodicMemory.length);

    if (Array.isArray(rawEpisodicMemory)) {
      for (const group of rawEpisodicMemory) {
        // Handle both nested array (groups) and flat object structures
        const items = Array.isArray(group) ? group : [group];
        
        if (Array.isArray(group)) {
             console.log('[MemMachineMemory] DEBUG - Processing memory group size:', group.length);
        }

        for (const item of items) {
            if (item && typeof item === 'object' && item.content && item.content.trim() !== '') {
              const content = item.content;
              const producer = item.producer_id || 'unknown';
              const producedFor = item.produced_for_id || 'unknown';
              
              // Create unique key for deduplication
              const episodeKey = `${content}|${producer}|${producedFor}`;
              
              // Skip if we've already seen this exact episode
              if (!seenEpisodes.has(episodeKey)) {
                seenEpisodes.add(episodeKey);
                
                // DEBUG: Log accepted episode
                // console.log('[MemMachineMemory] DEBUG - Adding episode:', content.substring(0, 30) + '...');

                flattenedMemories.push({
                  episode_content: content,
                  producer,
                  produced_for: producedFor,
                  episode_type: item.episode_type || 'dialog',
                  timestamp: item.timestamp,
                  uuid: item.uuid,
                  content_type: item.content_type,
                  group_id: item.group_id,
                  session_id: item.session_id,
                  user_metadata: item.user_metadata,
                });
              } else {
                console.log('[MemMachineMemory] DEBUG - Duplicate episode skipped:', episodeKey.substring(0, 50) + '...');
              }
            } else {
                console.log('[MemMachineMemory] DEBUG - Invalid or empty episode item encountered:', JSON.stringify(item).substring(0, 100));
            }
        }
      }
    }

    console.log('[MemMachineMemory] DEBUG - Final flattened memories count:', flattenedMemories.length);

    // Transform profile memory to expected structure with deduplication
    const profileMemoryFacts: any[] = [];
    const deduplicatedSemanticMemory: any[] = [];
    const seenFacts = new Set<string>();
    
    if (Array.isArray(rawProfileMemory)) {
      for (const item of rawProfileMemory) {
        if (item && typeof item === 'object') {
          const tag = item.tag || 'General';
          const feature = item.feature || 'property';
          const value = item.value || '';
          
          // Create unique key for deduplication
          const factKey = `${tag}|${feature}|${value}`;
          
          // Skip if we've already seen this exact fact
          if (!seenFacts.has(factKey) && value.trim() !== '') {
            seenFacts.add(factKey);
            
            profileMemoryFacts.push({
              subject: tag,
              predicate: feature,
              object: value,
              confidence: item.metadata?.similarity_score,
              source: `id_${item.metadata?.id}`,
            });
            
            deduplicatedSemanticMemory.push(item);
          }
        }
      }
    }

    const profileMemory: ProfileMemoryFacts = {
      facts: profileMemoryFacts,
      entities: {},
    };

    console.log('[MemMachineMemory] DEBUG - Profile/Semantic Memory Processing:', {
        rawProfileCount: Array.isArray(rawProfileMemory) ? rawProfileMemory.length : 0,
        dedupedProfileCount: profileMemoryFacts.length,
        dedupedSemanticCount: deduplicatedSemanticMemory.length
    });

    // Categorize memories into temporal arrays
    const historyCount = this.config.historyCount !== undefined ? this.config.historyCount : 5;
    const shortTermCount = this.config.shortTermCount !== undefined ? this.config.shortTermCount : 10;
    const categorized = categorizeMemories(flattenedMemories, historyCount, shortTermCount);

    console.log('[MemMachineMemory] DEBUG - Memory Categorization:', {
        totalFlattened: flattenedMemories.length,
        historyCountConfig: historyCount,
        shortTermCountConfig: shortTermCount,
        historyActual: categorized.history.length,
        shortTermActual: categorized.shortTermMemory.length,
        longTermActual: categorized.longTermMemory.length
    });

    // Render template with all memory types
    const contextText = renderTemplate(
      this.config.contextTemplate!,
      categorized,
      profileMemory,
      deduplicatedSemanticMemory,
      episodeSummary,
    );

    console.log('[MemMachineMemory] Templated context length:', contextText.length);
    console.log('[MemMachineMemory] Rendered context preview:', contextText.substring(0, 500));

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
