import type {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  IDataObject,
  IHttpRequestOptions,
  ISupplyDataFunctions,
  SupplyData,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { categorizeMemories, type EpisodicMemoryItem } from './utils/categorizeMemories';
import { renderTemplate, type ProfileMemoryFacts } from './utils/renderTemplate';
import { MemMachineMemory } from './MemMachineMemory';
import { MemoryTracer } from './utils/tracer';

export class MemMachine implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'MemMachine',
    name: 'memMachine',
    icon: 'file:Memory.icon.png',
    group: ['transform'],
    version: 1,
    subtitle: '={{$parameter["operation"]}}',
    description: 'Store and retrieve conversational memory using MemMachine',
    defaults: {
      name: 'MemMachine',
    },
    usableAsTool: true,
    inputs: ['main'],
    outputs: ['main', 'ai_memory'],
    outputNames: ['Main', 'Memory'],
    credentials: [
      {
        name: 'memMachineApi',
        required: true,
      },
    ],
    requestDefaults: {
      baseURL: '={{$credentials.apiEndpoint}}',
      headers: {
        'Content-Type': 'application/json',
      },
    },
    properties: [
      // Mode Selection Parameter (memory vs manual)
      {
        displayName: 'Mode',
        name: 'mode',
        type: 'options',
        noDataExpression: true,
        options: [
          {
            name: 'AI Agent Memory',
            value: 'memory',
            description: 'Connect as memory provider to AI Agent nodes',
          },
          {
            name: 'Manual Operations',
            value: 'manual',
            description: 'Manually store and retrieve memories via Store/Enrich operations',
          },
        ],
        default: 'memory',
        description: 'Whether to use this node as an AI Agent memory provider or for manual memory operations',
      },
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        displayOptions: {
          show: {
            mode: ['manual'],
          },
        },
        options: [
          {
            name: 'Store',
            value: 'store',
            description: 'Store a conversation message in MemMachine',
            action: 'Store a message',
            routing: {
              request: {
                method: 'POST',
                url: '/v1/memories',
              },
            },
          },
          {
            name: 'Enrich',
            value: 'enrich',
            description: 'Retrieve historical context from MemMachine to enrich AI responses',
            action: 'Enrich with context',
            routing: {
              request: {
                method: 'POST',
                url: '/v1/memories/search',
              },
            },
          },
        ],
        default: 'store',
      },
      // Memory Mode Parameters
      {
        displayName: 'Context Window Length',
        name: 'contextWindowLength',
        type: 'number',
        displayOptions: {
          show: {
            mode: ['memory'],
          },
        },
        default: 10,
        typeOptions: {
          minValue: 2,
          maxValue: 100,
        },
        description: 'Maximum number of recent messages to include in conversation history',
      },
      {
        displayName: 'Enable Context Template',
        name: 'enableMemoryTemplate',
        type: 'boolean',
        displayOptions: {
          show: {
            mode: ['memory'],
          },
        },
        default: false,
        description: 'Whether to format memory context using a template (provides structured history, short-term, long-term, and profile memory sections)',
      },
      {
        displayName: 'Memory Context Template',
        name: 'memoryContextTemplate',
        type: 'string',
        typeOptions: {
          rows: 10,
        },
        displayOptions: {
          show: {
            mode: ['memory'],
            enableMemoryTemplate: [true],
          },
        },
        default: `# Conversation Context

## Recent History
{{history}}

## Short-Term Memory
{{shortTermMemory}}

## Long-Term Memory
{{longTermMemory}}

## User Profile
{{profileMemory}}`,
        description: 'Template for formatting memory context. Available placeholders: {{history}}, {{shortTermMemory}}, {{longTermMemory}}, {{profileMemory}}',
        hint: 'The formatted context will be provided to the AI as a single system message',
      },
      {
        displayName: 'Template Options',
        name: 'memoryTemplateOptions',
        type: 'collection',
        placeholder: 'Add Option',
        displayOptions: {
          show: {
            mode: ['memory'],
            enableMemoryTemplate: [true],
          },
        },
        default: {},
        options: [
          {
            displayName: 'History Count',
            name: 'historyCount',
            type: 'number',
            default: 5,
            typeOptions: {
              minValue: 1,
              maxValue: 50,
            },
            description: 'Number of most recent conversation turns to include in history section',
          },
          {
            displayName: 'Short-Term Count',
            name: 'shortTermCount',
            type: 'number',
            default: 10,
            typeOptions: {
              minValue: 1,
              maxValue: 50,
            },
            description: 'Number of items to include in short-term memory section',
          },
        ],
      },
      // Session Context Parameters (shared across modes)
      {
        displayName: 'Session ID',
        name: 'sessionId',
        type: 'string',
        default: '={{$json.sessionId}}',
        required: true,
        placeholder: '={{$json.sessionId}}',
        description: 'Conversation session identifier for isolation. Typically provided by Chat Trigger.',
        hint: 'For memory mode: Isolates conversation history by session. For manual mode: Used for filtering.',
      },
      {
        displayName: 'Group ID',
        name: 'groupId',
        type: 'string',
        default: 'default',
        required: true,
        placeholder: 'org_123',
        description: 'Organization or group identifier for memory organization',
      },
      {
        displayName: 'Agent ID',
        name: 'agentId',
        type: 'string',
        default: '={{$workflow.name}}',
        required: true,
        placeholder: 'agent_assistant',
        description: 'AI agent identifier (can be comma-separated for multiple agents)',
      },
      {
        displayName: 'User ID',
        name: 'userId',
        type: 'string',
        default: '={{$json.userId}}',
        required: true,
        placeholder: 'user_456',
        description: 'User identifier (can be comma-separated for multiple users)',
      },
      // Store Operation Parameters
      {
        displayName: 'Producer',
        name: 'producer',
        type: 'string',
        displayOptions: {
          show: {
            mode: ['manual'],
            operation: ['store'],
          },
        },
        default: '',
        required: true,
        placeholder: 'user_456 or agent_assistant',
        description: 'Who created this message (user_id or agent_id)',
      },
      {
        displayName: 'Produced For',
        name: 'producedFor',
        type: 'string',
        displayOptions: {
          show: {
            mode: ['manual'],
            operation: ['store'],
          },
        },
        default: '',
        required: true,
        placeholder: 'agent_assistant or user_456',
        description: 'Who this message is intended for (user_id or agent_id)',
      },
      {
        displayName: 'Episode Content',
        name: 'episodeContent',
        type: 'string',
        displayOptions: {
          show: {
            mode: ['manual'],
            operation: ['store'],
          },
        },
        typeOptions: {
          rows: 4,
        },
        default: '={{$json.content}}',
        required: true,
        description: 'The message text to store',
      },
      {
        displayName: 'Episode Type',
        name: 'episodeType',
        type: 'options',
        displayOptions: {
          show: {
            mode: ['manual'],
            operation: ['store'],
          },
        },
        options: [
          {
            name: 'Dialog',
            value: 'dialog',
          },
          {
            name: 'Summary',
            value: 'summary',
          },
          {
            name: 'Observation',
            value: 'observation',
          },
        ],
        default: 'dialog',
        description: 'Type of episode being stored',
      },
      {
        displayName: 'Metadata',
        name: 'metadata',
        type: 'json',
        displayOptions: {
          show: {
            mode: ['manual'],
            operation: ['store'],
          },
        },
        default: '{}',
        description: 'Optional metadata as JSON object',
      },
      // Enrich Operation Parameters
      {
        displayName: 'Query',
        name: 'query',
        type: 'string',
        displayOptions: {
          show: {
            mode: ['manual'],
            operation: ['enrich'],
          },
        },
        default: '={{$json.content}}',
        required: true,
        description: 'Natural language query to search for relevant memories',
      },
      {
        displayName: 'Limit',
        name: 'limit',
        type: 'number',
        displayOptions: {
          show: {
            mode: ['manual'],
            operation: ['enrich'],
          },
        },
        default: 10,
        typeOptions: {
          minValue: 1,
          maxValue: 100,
        },
        description: 'Maximum number of memories to retrieve',
      },
      {
        displayName: 'Filter by Session',
        name: 'filterBySession',
        type: 'boolean',
        displayOptions: {
          show: {
            mode: ['manual'],
            operation: ['enrich'],
          },
        },
        default: true,
        description: 'Whether to filter memories by the current session_id',
      },
      {
        displayName: 'Filter',
        name: 'filter',
        type: 'json',
        displayOptions: {
          show: {
            mode: ['manual'],
            operation: ['enrich'],
          },
        },
        default: '{}',
        description: 'Optional additional filter as JSON object for episodic/profile memory',
      },
      // Template Parameters (US3)
      {
        displayName: 'Enable Template',
        name: 'enableTemplate',
        type: 'boolean',
        displayOptions: {
          show: {
            mode: ['manual'],
            operation: ['enrich'],
          },
        },
        default: true,
        description: 'Whether to render a formatted context template from categorized memories',
      },
      {
        displayName: 'Context Template',
        name: 'contextTemplate',
        type: 'string',
        typeOptions: {
          rows: 10,
        },
        displayOptions: {
          show: {
            mode: ['manual'],
            operation: ['enrich'],
            enableTemplate: [true],
          },
        },
        default: `# Conversation Context

## Recent History
{{history}}

## Short-Term Memory
{{shortTermMemory}}

## Long-Term Memory
{{longTermMemory}}

## Profile Information
{{profileMemory}}`,
        description: 'Markdown template for formatting context. Supported placeholders: {{history}}, {{shortTermMemory}}, {{longTermMemory}}, {{profileMemory}}',
        hint: 'Use {{history}}, {{shortTermMemory}}, {{longTermMemory}}, and {{profileMemory}} as placeholders in your template',
      },
      {
        displayName: 'Advanced Options',
        name: 'advancedOptions',
        type: 'collection',
        placeholder: 'Add Option',
        displayOptions: {
          show: {
            mode: ['manual'],
            operation: ['enrich'],
            enableTemplate: [true],
          },
        },
        default: {},
        options: [
          {
            displayName: 'History Count',
            name: 'historyCount',
            type: 'number',
            default: 5,
            typeOptions: {
              minValue: 1,
              maxValue: 50,
            },
            description: 'Number of most recent items to include in history',
          },
          {
            displayName: 'Short-Term Count',
            name: 'shortTermCount',
            type: 'number',
            default: 10,
            typeOptions: {
              minValue: 1,
              maxValue: 50,
            },
            description: 'Number of items to include in short-term memory',
          },
        ],
      },
      // n8n Cloud Compliant Tracing (Feature 006)
      {
        displayName: 'Enable Cloud Tracing',
        name: 'tracingEnabled',
        type: 'boolean',
        default: false,
        description: 'Enable operation tracing for debugging and monitoring (n8n Cloud compatible)',
        hint: 'Captures operation lifecycle, timing, and error context without external dependencies',
      },
      {
        displayName: 'Trace Output Format',
        name: 'traceFormat',
        type: 'options',
        displayOptions: {
          show: {
            tracingEnabled: [true],
          },
        },
        options: [
          {
            name: 'JSON (Structured)',
            value: 'json',
            description: 'Output traces as structured JSON for programmatic parsing',
          },
          {
            name: 'Human Readable',
            value: 'human',
            description: 'Output traces as formatted text for console viewing',
          },
        ],
        default: 'json',
        description: 'Format for trace output in node execution results',
      },
      {
        displayName: 'Trace Verbosity',
        name: 'traceVerbosity',
        type: 'options',
        displayOptions: {
          show: {
            tracingEnabled: [true],
          },
        },
        options: [
          {
            name: 'Minimal',
            value: 'minimal',
            description: 'Essential fields only (traceId, timestamp, status)',
          },
          {
            name: 'Normal',
            value: 'normal',
            description: 'Standard detail level with timing and memory counts',
          },
          {
            name: 'Verbose',
            value: 'verbose',
            description: 'Comprehensive detail including all metadata fields',
          },
        ],
        default: 'normal',
        description: 'Level of detail in trace output',
      },
      {
        displayName: 'Export to Jaeger',
        name: 'exportToJaeger',
        type: 'boolean',
        displayOptions: {
          show: {
            tracingEnabled: [true],
          },
        },
        default: false,
        description: 'Send traces to Jaeger via OTLP HTTP (requires Jaeger endpoint)',
        hint: 'Traces will be sent to Jaeger for visualization while still appearing in workflow output',
      },
      {
        displayName: 'Jaeger OTLP Endpoint',
        name: 'jaegerOtlpEndpoint',
        type: 'string',
        displayOptions: {
          show: {
            tracingEnabled: [true],
            exportToJaeger: [true],
          },
        },
        default: 'http://jaeger:4318/v1/traces',
        description: 'Jaeger OTLP HTTP endpoint URL',
        placeholder: 'http://jaeger:4318/v1/traces',
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];
    const operation = this.getNodeParameter('operation', 0) as string;

    // Legacy tracer (no-op for backward compatibility with existing code)
    const tracer = new MemoryTracer({
      enabled: false,
      format: 'json',
      verbosity: 'minimal',
      maxEntrySize: 10240,
    });

    // T017: Initialize n8n Cloud-compliant tracing (Feature 006)
    const cloudTracingEnabled = this.getNodeParameter('tracingEnabled', 0, false) as boolean;
    const cloudTraceFormat = this.getNodeParameter('traceFormat', 0, 'json') as 'json' | 'human';
    const cloudTraceVerbosity = this.getNodeParameter('traceVerbosity', 0, 'normal') as 'minimal' | 'normal' | 'verbose';

    // T018: Instantiate cloud-compliant tracer
    const cloudTracer = new MemoryTracer({
      enabled: cloudTracingEnabled,
      format: cloudTraceFormat,
      verbosity: cloudTraceVerbosity,
      maxEntrySize: 10240, // 10KB per FR-010
    });

    for (let i = 0; i < items.length; i++) {
      let operationSpan: any = undefined;
      let traceId = ''; // Cloud trace ID for this operation
      
      try {
        // Build session context
        const session = {
          group_id: this.getNodeParameter('groupId', i) as string,
          agent_id: (this.getNodeParameter('agentId', i) as string).split(',').map((id) => id.trim()),
          user_id: (this.getNodeParameter('userId', i) as string).split(',').map((id) => id.trim()),
          session_id: this.getNodeParameter('sessionId', i) as string,
        };

        if (operation === 'store') {
          // T027: Start cloud-compliant trace
          traceId = cloudTracer.startOperation('store', {
            sessionId: session.session_id,
            groupId: session.group_id,
            userId: Array.isArray(session.user_id) ? session.user_id.join(',') : session.user_id,
            agentId: Array.isArray(session.agent_id) ? session.agent_id.join(',') : session.agent_id,
          });

          // Store operation - start tracing span
          operationSpan = tracer.startSpan('memory.store', {
            attributes: {
              'operation.type': 'store',
              'session.id': session.session_id,
              'user.id': Array.isArray(session.user_id) ? session.user_id.join(',') : session.user_id,
              'agent.id': Array.isArray(session.agent_id) ? session.agent_id.join(',') : session.agent_id,
            },
          });
          
          const producer = this.getNodeParameter('producer', i) as string;
          const producedFor = this.getNodeParameter('producedFor', i) as string;
          const episodeContent = this.getNodeParameter('episodeContent', i) as string;
          const episodeType = this.getNodeParameter('episodeType', i) as string;
          const metadataStr = this.getNodeParameter('metadata', i) as string;
          
          let metadata: IDataObject = {};
          if (metadataStr && metadataStr.trim() !== '{}' && metadataStr.trim() !== '') {
            try {
              metadata = JSON.parse(metadataStr);
            } catch (error) {
              throw new NodeOperationError(
                this.getNode(),
                `Invalid metadata JSON: ${(error as Error).message}`,
                { itemIndex: i }
              );
            }
          }

          const credentials = await this.getCredentials('memMachineApi');
          const baseURL = credentials.apiEndpoint as string;

          const requestOptions: IHttpRequestOptions = {
            method: 'POST',
            baseURL,
            url: '/v1/memories',
            headers: {
              'session-id': session.session_id,
            },
            body: {
              session,
              producer,
              produced_for: producedFor,
              episode_content: episodeContent,
              episode_type: episodeType,
              metadata,
            },
            json: true,
            timeout: 30000, // 30 second timeout
          };

          // Debug: Log request to verify session_id
          console.log('MemMachine Store - Session object:', JSON.stringify(session, null, 2));
          console.log('MemMachine Store - Headers:', requestOptions.headers);

          // Add tracing events for request details
          tracer.addEvent(operationSpan, 'memmachine.store.request.headers', {
            'session-id': session.session_id,
            'Content-Type': 'application/json',
          });
          
          tracer.addEvent(operationSpan, 'memmachine.store.request.payload', {
            'payload.session': JSON.stringify(session),
            'payload.producer': producer,
            'payload.produced_for': producedFor,
            'payload.episode_content': episodeContent.length > 200 ? episodeContent.substring(0, 200) + '...' : episodeContent,
            'payload.episode_type': episodeType,
            'payload.metadata': JSON.stringify(metadata),
          });

          // Add request send event with structured KV logs
          const requestHeaders = requestOptions.headers || {};
          const headerLogKV: Record<string, string | number | boolean> = {};
          for (const [key, value] of Object.entries(requestHeaders)) {
            headerLogKV[`header.${key}`] = String(value);
          }
          
          tracer.addEvent(operationSpan, 'request.send', {
            'http.method': 'POST',
            'http.url': `${baseURL}/v1/memories`,
            'http.target': '/v1/memories',
            ...headerLogKV,
            'body': JSON.stringify(requestOptions.body),
          });

          const response = await this.helpers.httpRequestWithAuthentication.call(
            this,
            'memMachineApi',
            requestOptions
          );

          // Add response received event with structured KV logs
          const responseBody = JSON.stringify(response || { success: true });
          tracer.addEvent(operationSpan, 'response.received', {
            'http.status_code': 200,
            'http.status_text': 'OK',
            'body': responseBody,
            'body.size': responseBody.length,
          });

          // Store endpoint returns null on success - pass input data along
          const storeResult = response ? (response as IDataObject) : { success: true, stored: true };
          
          // Add additional span attributes
          tracer.addAttributes(operationSpan, {
            'message.length': episodeContent.length,
          });
          
          // End span successfully
          tracer.endSpan(operationSpan);

          // T028: Complete cloud trace on success with API details
          cloudTracer.completeOperation(traceId, {
            success: true,
            metadata: {
              messageLength: episodeContent.length,
              episodeType,
              stored: true,
              // API Request details
              'http.method': 'POST',
              'http.url': `${baseURL}/v1/memories`,
              'http.target': '/v1/memories',
              'request.headers': JSON.stringify({ 'session-id': session.session_id }),
              'request.body': JSON.stringify(requestOptions.body),
              'request.body.size': JSON.stringify(requestOptions.body).length,
              // API Response details
              'http.status_code': 200,
              'response.body': responseBody.substring(0, 500), // Truncate to avoid huge metadata
              'response.body.size': responseBody.length,
            },
          });
          
          returnData.push({
            json: {
              ...items[i].json,
              ...storeResult,
            },
            pairedItem: { item: i },
          });
        } else if (operation === 'enrich') {
          // T027: Start cloud-compliant trace
          traceId = cloudTracer.startOperation('enrich', {
            sessionId: session.session_id,
            groupId: session.group_id,
            userId: Array.isArray(session.user_id) ? session.user_id.join(',') : session.user_id,
            agentId: Array.isArray(session.agent_id) ? session.agent_id.join(',') : session.agent_id,
          });

          // Enrich operation - start tracing span
          operationSpan = tracer.startSpan('memory.enrich', {
            attributes: {
              'operation.type': 'enrich',
              'session.id': session.session_id,
              'user.id': Array.isArray(session.user_id) ? session.user_id.join(',') : session.user_id,
              'agent.id': Array.isArray(session.agent_id) ? session.agent_id.join(',') : session.agent_id,
            },
          });
          
          // Enrich operation
          const query = this.getNodeParameter('query', i) as string;
          const limit = this.getNodeParameter('limit', i) as number;
          const filterBySession = this.getNodeParameter('filterBySession', i, true) as boolean;
          const filterStr = this.getNodeParameter('filter', i) as string;
          
          // Get template parameters (US3)
          const enableTemplate = this.getNodeParameter('enableTemplate', i, true) as boolean;
          const contextTemplate = this.getNodeParameter('contextTemplate', i) as string;
          const advancedOptions = this.getNodeParameter('advancedOptions', i, {}) as IDataObject;
          const historyCount = (advancedOptions.historyCount as number) || 5;
          const shortTermCount = (advancedOptions.shortTermCount as number) || 10;
          
          // Build filter object
          let filter: IDataObject = {};
          
          // Add session_id filter if enabled
          if (filterBySession) {
            filter.session_id = session.session_id;
          }
          
          // Merge with additional custom filters
          if (filterStr && filterStr.trim() !== '{}' && filterStr.trim() !== '') {
            try {
              const customFilter = JSON.parse(filterStr);
              filter = { ...filter, ...customFilter };
            } catch (error) {
              throw new NodeOperationError(
                this.getNode(),
                `Invalid filter JSON: ${(error as Error).message}`,
                { itemIndex: i }
              );
            }
          }

          const credentials = await this.getCredentials('memMachineApi');
          const baseURL = credentials.apiEndpoint as string;

          const requestOptions: IHttpRequestOptions = {
            method: 'POST',
            baseURL,
            url: '/v1/memories/search',
            headers: {
              'session-id': session.session_id,
            },
            body: {
              session,
              query,
              limit,
              ...(Object.keys(filter).length > 0 && { filter }),
            },
            json: true,
            timeout: 30000, // 30 second timeout
          };

          // Add tracing events for request details
          tracer.addEvent(operationSpan, 'memmachine.search.request.headers', {
            'session-id': session.session_id,
            'Content-Type': 'application/json',
          });
          
          tracer.addEvent(operationSpan, 'memmachine.search.request.payload', {
            'payload.session': JSON.stringify(session),
            'payload.query': query,
            'payload.limit': limit,
            'payload.filter': Object.keys(filter).length > 0 ? JSON.stringify(filter) : '{}',
          });

          // Add request send event with structured KV logs
          const requestHeaders = requestOptions.headers || {};
          const headerLogKV: Record<string, string | number | boolean> = {};
          for (const [key, value] of Object.entries(requestHeaders)) {
            headerLogKV[`header.${key}`] = String(value);
          }
          
          tracer.addEvent(operationSpan, 'request.send', {
            'http.method': 'POST',
            'http.url': `${baseURL}/v1/memories/search`,
            'http.target': '/v1/memories/search',
            ...headerLogKV,
            'body': JSON.stringify(requestOptions.body),
          });

          const response = await this.helpers.httpRequestWithAuthentication.call(
            this,
            'memMachineApi',
            requestOptions
          );

          // Extract memories from response and include full API response
          const responseData = response as IDataObject;
          const content = (responseData.content as IDataObject) || {};
          const rawEpisodicMemory = content.episodic_memory || [];
          const rawProfileMemory = content.profile_memory || [];
          
          // Add response metrics to span
          tracer.addAttributes(operationSpan, {
            'memmachine.response.episodic_count': Array.isArray(rawEpisodicMemory) ? rawEpisodicMemory.length : 0,
            'memmachine.response.profile_count': Array.isArray(rawProfileMemory) ? rawProfileMemory.length : 0,
          });

          // Add response received event with structured KV logs
          const responseBody = JSON.stringify(responseData);
          tracer.addEvent(operationSpan, 'response.received', {
            'http.status_code': 200,
            'http.status_text': 'OK',
            'body': responseBody.length > 5000 ? responseBody.substring(0, 5000) + '...[truncated]' : responseBody,
            'body.size': responseBody.length,
          });
          
          // Flatten nested arrays and transform to expected structure
          // MemMachine API returns array of arrays, we need to flatten it
          const flattenedMemories: any[] = [];
          if (Array.isArray(rawEpisodicMemory)) {
            for (const group of rawEpisodicMemory) {
              if (Array.isArray(group)) {
                // Filter out empty content items and map field names
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
              } else if (group && typeof group === 'string' && group.trim() !== '') {
                // Handle string items
                flattenedMemories.push({
                  episode_content: group,
                  producer: 'unknown',
                  produced_for: 'unknown',
                  episode_type: 'dialog',
                });
              }
            }
          }
          
          const episodicMemories = flattenedMemories as EpisodicMemoryItem[];
          
          // Transform profile memory to expected structure
          // MemMachine API returns array with tag/feature/value, we need to convert to facts structure
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
          
          // Categorize memories into temporal arrays (US1) with custom counts
          const categorized = categorizeMemories(episodicMemories, historyCount, shortTermCount);

          // Render template if enabled (US3)
          let context = '';
          if (enableTemplate) {
            try {
              context = renderTemplate(contextTemplate, categorized, profileMemory);
            } catch (error) {
              if (this.continueOnFail()) {
                context = `*Template rendering failed: ${(error as Error).message}*`;
              } else {
                throw new NodeOperationError(
                  this.getNode(),
                  `Failed to render context template: ${(error as Error).message}`,
                  { itemIndex: i }
                );
              }
            }
          }

          // Add additional span attributes
          tracer.addAttributes(operationSpan, {
            'memory.count': episodicMemories.length,
            'template.enabled': enableTemplate,
          });
          
          // End span successfully
          tracer.endSpan(operationSpan);

          // T028: Complete cloud trace on success with API details
          cloudTracer.completeOperation(traceId, {
            success: true,
            metadata: {
              memoryCount: episodicMemories.length,
              historyCount: categorized.history.length,
              shortTermCount: categorized.shortTermMemory.length,
              longTermCount: categorized.longTermMemory.length,
              profileCount: profileMemory.length,
              templateEnabled: enableTemplate,
              contextLength: context.length,
              // API Request details
              'http.method': 'POST',
              'http.url': `${baseURL}/v1/memories/search`,
              'http.target': '/v1/memories/search',
              'request.headers': JSON.stringify({ 'session-id': session.session_id }),
              'request.body': JSON.stringify(requestOptions.body),
              'request.body.size': JSON.stringify(requestOptions.body).length,
              'request.query': query,
              'request.limit': limit,
              // API Response details
              'http.status_code': 200,
              'response.body': responseBody.substring(0, 500), // Truncate to avoid huge metadata
              'response.body.size': responseBody.length,
              'response.episodic_count': Array.isArray(rawEpisodicMemory) ? rawEpisodicMemory.length : 0,
              'response.profile_count': Array.isArray(rawProfileMemory) ? rawProfileMemory.length : 0,
            },
          });
          
          returnData.push({
            json: {
              ...items[i].json,
              episodic_memory: episodicMemories,
              history: categorized.history,
              shortTermMemory: categorized.shortTermMemory,
              longTermMemory: categorized.longTermMemory,
              profileMemory,
              context,
              totalResults: episodicMemories.length,
              apiResponse: responseData,
            },
            pairedItem: { item: i },
          });
        }
      } catch (error) {
        // End span with error if tracing is enabled
        tracer.endSpanWithError(operationSpan, error as Error);

        // T029: Complete cloud trace on error
        if (traceId) {
          cloudTracer.completeOperation(traceId, {
            success: false,
            error: {
              message: (error as Error).message,
              type: 'unexpected',
            },
          });
        }
        
        if (this.continueOnFail()) {
          returnData.push({
            json: {
              error: (error as Error).message,
            },
            pairedItem: { item: i },
          });
          continue;
        }
        throw error;
      }
    }

    // T019: Append cloud-compliant trace output if enabled
    if (cloudTracer.isEnabled()) {
      const traceItems = cloudTracer.getTraceOutput();
      returnData.push(...traceItems);

      // Export to Jaeger if enabled
      const exportToJaeger = this.getNodeParameter('exportToJaeger', 0, false) as boolean;
      if (exportToJaeger) {
        const jaegerEndpoint = this.getNodeParameter('jaegerOtlpEndpoint', 0, 'http://jaeger:4318/v1/traces') as string;
        // Fire and forget - don't wait for export to complete
        cloudTracer.exportTracesToJaeger(jaegerEndpoint).catch((error: Error) => {
          console.error('Failed to export traces to Jaeger:', error);
        });
      }
    }

    return [returnData];
  }

  /**
   * Supply data method for AI Agent memory connection
   * Called when node is connected to an AI Agent's Memory port
   */
  async supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<SupplyData> {
    try {
      // Validate mode
      const mode = this.getNodeParameter('mode', itemIndex) as string;
      if (mode !== 'memory') {
        throw new NodeOperationError(
          this.getNode(),
          'Node must be in "AI Agent Memory" mode to connect to AI Agents. Please change the Mode parameter.',
          { itemIndex }
        );
      }

      // Extract session context parameters
      const sessionId = this.getNodeParameter('sessionId', itemIndex) as string;
      const groupId = this.getNodeParameter('groupId', itemIndex, 'default') as string;
      const agentId = this.getNodeParameter('agentId', itemIndex) as string;
      const userId = this.getNodeParameter('userId', itemIndex) as string;
      const contextWindowLength = this.getNodeParameter('contextWindowLength', itemIndex, 10) as number;
      
      // Extract template parameters
      const enableTemplate = this.getNodeParameter('enableMemoryTemplate', itemIndex, false) as boolean;
      const contextTemplate = this.getNodeParameter('memoryContextTemplate', itemIndex, '') as string;
      const templateOptions = this.getNodeParameter('memoryTemplateOptions', itemIndex, {}) as IDataObject;
      const historyCount = (templateOptions.historyCount as number) || 5;
      const shortTermCount = (templateOptions.shortTermCount as number) || 10;

      // Get credentials
      const credentials = await this.getCredentials('memMachineApi');
      const apiUrl = credentials.apiEndpoint as string;
      const apiKey = credentials.apiKey as string | undefined;

      // Parse comma-separated IDs into arrays
      const agentIdArray = agentId.split(',').map((id) => id.trim());
      const userIdArray = userId.split(',').map((id) => id.trim());

      // Validate session ID (required for memory isolation)
      if (!sessionId || sessionId.trim() === '') {
        throw new NodeOperationError(
          this.getNode(),
          'Session ID is required for AI Agent memory. Please provide a session identifier.',
          { itemIndex }
        );
      }

      // Legacy tracer (no-op, kept for backward compatibility)
      const tracer: MemoryTracer | undefined = undefined;

      // Create MemMachineMemory instance with configuration
      const memory = new MemMachineMemory({
        apiUrl,
        apiKey,
        groupId,
        agentId: agentIdArray,
        userId: userIdArray,
        sessionId: sessionId.trim(),
        contextWindowLength,
        enableTemplate,
        contextTemplate: enableTemplate ? contextTemplate : undefined,
        historyCount,
        shortTermCount,
        tracer,
        logger: {
          info: (message: string, ...args: any[]) => {
            console.log(`[MemMachineMemory] ${message}`, ...args);
          },
          error: (message: string, ...args: any[]) => {
            console.error(`[MemMachineMemory ERROR] ${message}`, ...args);
          },
          warn: (message: string, ...args: any[]) => {
            console.warn(`[MemMachineMemory WARN] ${message}`, ...args);
          },
        },
      });

      // Return memory instance wrapped in SupplyData format
      console.log('[MemMachine] supplyData - Returning memory instance', {
        sessionId: sessionId.trim(),
        memoryType: memory.constructor.name,
      });
      
      return {
        response: memory,
      };
    } catch (error) {
      throw new NodeOperationError(
        this.getNode(),
        `Failed to initialize MemMachine memory: ${(error as Error).message}`,
        { itemIndex }
      );
    }
  }
}

// Alias export for backwards compatibility with filename
export { MemMachine as Memory };
