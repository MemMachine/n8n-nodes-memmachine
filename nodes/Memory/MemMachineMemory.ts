/**
 * MemMachine Memory Integration for n8n AI Agents
 * 
 * Implements LangChain's BaseChatMemory interface to provide conversation memory
 * for AI Agents using MemMachine's cloud API as the storage backend.
 */

import { BaseChatMemory } from '@langchain/community/memory/chat_memory';
import type { InputValues, MemoryVariables } from '@langchain/core/memory';
import type { BaseMessage } from '@langchain/core/messages';
import { SystemMessage } from '@langchain/core/messages';
import { categorizeMemories, type EpisodicMemoryItem } from './utils/categorizeMemories';
import { renderTemplate, type ProfileMemoryFacts } from './utils/renderTemplate';
import { MemoryTracer } from './utils/tracer';
// HumanMessage and AIMessage will be used in Phase 4 for message type conversion

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
  
  /** Optional tracer for distributed tracing */
  tracer?: MemoryTracer;
}

/**
 * LangChain memory implementation backed by MemMachine API
 * 
 * Extends BaseChatMemory to provide the interface that
 * n8n AI Agents expect for conversation history management.
 */
export class MemMachineMemory extends BaseChatMemory {
  private config: MemMachineMemoryConfig;
  
  constructor(config: MemMachineMemoryConfig) {
    // Initialize BaseChatMemory with standard LangChain configuration
    super({
      returnMessages: true,
      inputKey: 'input',
      outputKey: 'output',
    });
    
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
   * Memory key for chat history
   */
  get memoryKeys() {
    return ['chat_history'];
  }
  
  /**
   * Load conversation history from MemMachine API
   * Called by AI Agent before generating responses
   */
  async loadMemoryVariables(_values: InputValues): Promise<MemoryVariables> {
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

      // Make request to MemMachine Search API
      const response = await fetch(`${this.config.apiUrl}/v1/memories/search`, {
        method: 'POST',
        headers,
        body: JSON.stringify(searchBody),
      });

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

      const data = await response.json() as { content?: { episodic_memory?: any[]; profile_memory?: any[] } };
      const responseBody = JSON.stringify(data);
      
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
      
      // If template is enabled, return formatted context as system message
      if (this.config.enableTemplate && this.config.contextTemplate) {
        return this.formatTemplatedMemory(rawEpisodicMemory, rawProfileMemory);
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

      // End search span successfully
      searchSpan && this.config.tracer?.addAttributes(searchSpan, {
        'memmachine.messages.total': messages.length,
        'memmachine.messages.returned': recentMessages.length,
      });
      searchSpan && this.config.tracer?.endSpan(searchSpan);

      return {
        chat_history: recentMessages,
      };
    } catch (error) {
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
        );
      }

      // Store agent response
      if (agentResponse) {
        await this.storeMessage(
          agentResponse,
          this.config.agentId[0], // Agent is the producer
          this.config.userId[0], // User is the recipient
        );
      }

      this.config.logger?.info('saveContext - Successfully stored conversation turn');
    } catch (error) {
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

    const response = await fetch(`${this.config.apiUrl}/v1/memories`, {
      method: 'POST',
      headers,
      body: JSON.stringify(storeBody),
    });

    const responseText = await response.clone().text();

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

    // Return formatted context as a system message
    return {
      chat_history: [
        new SystemMessage(contextText),
      ],
    };
  }
}
