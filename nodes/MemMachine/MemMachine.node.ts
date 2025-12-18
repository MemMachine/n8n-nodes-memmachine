import type {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  IDataObject,
  IHttpRequestOptions,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import {
  categorizeMemories,
  type EpisodicMemoryItem,
  type CategorizedMemories,
} from '../utils/categorizeMemories';
import { renderTemplate, type ProfileMemoryFacts } from '../utils/renderTemplate';
import { MemoryTracer } from '../utils/tracer';

export class MemMachine implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'MemMachine Manager',
    name: 'memMachine',
    icon: 'file:../MemMachine.icon.svg',
    group: ['transform'],
    version: 1,
    subtitle: '={{$parameter["operation"]}}',
    description: 'Store and retrieve conversational memory using MemMachine',
    defaults: {
      name: 'MemMachine',
    },
    inputs: ['main'],
    outputs: ['main'],
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
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        options: [
          {
            name: 'Store',
            value: 'store',
            description: 'Store a conversation message in MemMachine',
            action: 'Store a message',
            routing: {
              request: {
                method: 'POST',
                url: '/memories',
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
                url: '/memories/search',
              },
            },
          },
          // Hide the following operations for now
          // {
          //   name: 'Retrieve Project (Auto-Create)',
          //   value: 'retrieve',
          //   description: 'Retrieve a MemMachine project, auto-create it if it does not exist',
          //   // eslint-disable-next-line n8n-nodes-base/node-param-operation-option-action-miscased
          //   action: 'Retrieve project (auto-create)',
          // },
          // {
          //   name: 'Delete Project',
          //   value: 'delete',
          //   description: 'Delete a MemMachine project',
          //   action: 'Delete project',
          // },
        ],
        default: 'store',
      },
      // V2 API Parameters - Organization and Project
      {
        displayName: 'Organization ID',
        name: 'orgId',
        type: 'string',
        default: '={{$json.sessionId}}',
        required: true,
        placeholder: '={{$json.sessionId}}',
        description:
          'Organization identifier for MemMachine API v2. All projects belong to an organization.',
        hint: 'Required for v2 API - defines the top-level tenant for memory storage',
      },
      {
        displayName: 'Project ID',
        name: 'projectId',
        type: 'string',
        default: '={{$json.sessionId}}',
        required: true,
        placeholder: '={{$json.sessionId}}',
        description:
          "Project identifier for memory isolation. Projects are automatically created if they don't exist.",
        hint: 'Required for v2 API - all memories are stored within a project. Auto-created on first use with default configuration.',
      },
      // Store Operation Parameters
      {
        displayName: 'Producer',
        name: 'producer',
        type: 'string',
        displayOptions: {
          show: {
            operation: ['store'],
          },
        },
        default: '={{$parameter.userId}}',
        required: true,
        placeholder: 'user_id or agent_assistant',
        description: 'Who created this message (user_id or agent_id)',
      },
      {
        displayName: 'Produced For',
        name: 'producedFor',
        type: 'string',
        displayOptions: {
          show: {
            operation: ['store'],
          },
        },
        default: '={{$parameter.agentId}}',
        required: true,
        placeholder: 'agent_assistant or user_id',
        description: 'Who this message is intended for (user_id or agent_id)',
      },
      {
        displayName: 'Episode Content',
        name: 'episodeContent',
        type: 'string',
        displayOptions: {
          show: {
            operation: ['store'],
          },
        },
        typeOptions: {
          rows: 4,
        },
        default: '={{$json.chatInput}}',
        required: true,
        description: 'The message text to store',
      },
      {
        displayName: 'Episode Type',
        name: 'episodeType',
        type: 'options',
        displayOptions: {
          show: {
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
            operation: ['enrich'],
          },
        },
        default: '={{$json.chatInput}}',
        required: true,
        description: 'Natural language query to search for relevant memories',
      },
      {
        displayName: 'Limit',
        name: 'limit',
        type: 'number',
        displayOptions: {
          show: {
            operation: ['enrich'],
          },
        },
        default: 50,
        typeOptions: {
          minValue: 1,
        },
        description: 'Max number of results to return',
      },
      {
        displayName: 'Filter by Session',
        name: 'filterBySession',
        type: 'boolean',
        displayOptions: {
          show: {
            operation: ['enrich'],
          },
        },
        default: true,
        description: 'Whether to filter memories based on provided session criteria',
      },
      {
        displayName: 'Filter',
        name: 'filter',
        type: 'json',
        displayOptions: {
          show: {
            operation: ['enrich'],
            filterBySession: [true],
          },
        },
        default: '{}',
        description: 'Optional additional filter as JSON object for episodic/semantic memory',
      },
      // Session Context Parameters (shared across modes)
      {
        displayName: 'Group ID',
        name: 'groupId',
        type: 'string',
        displayOptions: {
          show: {
            operation: ['store', 'enrich'],
          },
        },
        default: 'default',
        required: true,
        placeholder: 'org_id',
        description: 'Organization or group identifier for memory organization',
      },
      {
        displayName: 'Agent ID',
        name: 'agentId',
        type: 'string',
        displayOptions: {
          show: {
            operation: ['store', 'enrich'],
          },
        },
        default: '={{$workflow.name}}',
        required: true,
        placeholder: 'agent_assistant',
        description: 'AI agent identifier (can be comma-separated for multiple agents)',
      },
      {
        displayName: 'User ID',
        name: 'userId',
        type: 'string',
        displayOptions: {
          show: {
            operation: ['store', 'enrich'],
          },
        },
        default: 'user_v1',
        required: true,
        placeholder: 'user_id',
        description: 'User identifier (can be comma-separated for multiple users)',
      },
      // Manage Project Operation Parameters
      {
        displayName: 'Description',
        name: 'description',
        type: 'string',
        typeOptions: {
          rows: 3,
        },
        displayOptions: {
          show: {
            operation: ['retrieve'],
          },
        },
        default: '',
        description: 'Description for the project',
      },
      {
        displayName: 'Reranker',
        name: 'reranker',
        type: 'string',
        displayOptions: {
          show: {
            operation: ['retrieve'],
          },
        },
        default: '',
        description: 'Reranker model to use for the project',
      },
      {
        displayName: 'Embedder',
        name: 'embedder',
        type: 'string',
        displayOptions: {
          show: {
            operation: ['retrieve'],
          },
        },
        default: '',
        description: 'Embedder model to use for the project',
      },
      // Template Parameters (US3)
      {
        displayName: 'Enable Template',
        name: 'enableTemplate',
        type: 'boolean',
        displayOptions: {
          show: {
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
            operation: ['enrich'],
            enableTemplate: [true],
          },
        },
        default: `# Memory Context

**Instructions**: Use semantic memory as ground truth about the user. Enrich your understanding with short-term memory for recent context and long-term memory for historical patterns.

## User Profile (Semantic Memory)
{{semanticMemory}}

## Recent Context (Short-Term Memory)
{{shortTermMemory}}

{{episodeSummary}}

## Historical Context (Long-Term Memory)
{{longTermMemory}}`,
        description:
          'Markdown template for formatting memory context with semantic features, short-term, and long-term episodes',
        hint: 'Semantic memory provides verified facts, short-term provides recent context, long-term provides historical patterns',
      },
      {
        displayName: 'Advanced Options',
        name: 'advancedOptions',
        type: 'collection',
        placeholder: 'Add Option',
        displayOptions: {
          show: {
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
              minValue: 0,
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
              minValue: 0,
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
        description:
          'Whether to enable operation tracing for debugging and monitoring (n8n Cloud compatible)',
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
        description: 'Whether to send traces to Jaeger via OTLP HTTP (requires Jaeger endpoint)',
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

    let operation = '';
    try {
      operation = this.getNodeParameter('operation', 0, 'store') as string;
    } catch (error) {
      throw new NodeOperationError(
        this.getNode(),
        `Failed to get 'operation' parameter: ${(error as Error).message}. Please ensure the Operation parameter is set correctly when Mode is 'Manual Operations'.`,
        { itemIndex: 0 },
      );
    }

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
    const cloudTraceVerbosity = this.getNodeParameter('traceVerbosity', 0, 'normal') as
      | 'minimal'
      | 'normal'
      | 'verbose';

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
        // T009: Get and validate v2 API parameters (org_id, project_id)
        const orgId = this.getNodeParameter('orgId', i) as string;
        const projectId = this.getNodeParameter('projectId', i) as string;

        // T009: Validate required v2 API fields (FR-012)
        if (!orgId || orgId.trim() === '') {
          throw new NodeOperationError(
            this.getNode(),
            'MemMachine API v2 requires organization ID. Please provide a valid organization identifier.',
            { itemIndex: i },
          );
        }
        if (!projectId || projectId.trim() === '') {
          throw new NodeOperationError(
            this.getNode(),
            "MemMachine API v2 requires project ID. Please provide a valid project identifier. Projects are automatically created if they don't exist.",
            { itemIndex: i },
          );
        }

        if (operation === 'retrieve') {
          const credentials = await this.getCredentials('memMachineApi');
          const baseURL = credentials.apiEndpoint as string;
          let response: any;

          traceId = cloudTracer.startOperation('project', 'retrieve', {
            orgId,
            projectId,
          });

          try {
            const requestOptions: IHttpRequestOptions = {
              method: 'POST',
              baseURL,
              url: '/projects/get',
              body: {
                org_id: orgId.trim(),
                project_id: projectId.trim(),
              },
              json: true,
              timeout: 30000,
            };

            response = await this.helpers.httpRequestWithAuthentication.call(
              this,
              'memMachineApi',
              requestOptions,
            );

            const responseBody = JSON.stringify(response || { success: true });
            cloudTracer.completeOperation(traceId, {
              success: true,
              metadata: {
                retrieved: true,
                // API Request details
                'http.method': 'POST',
                'http.url': `${baseURL}/projects/get`,
                'http.target': '/projects/get',
                'request.body': JSON.stringify(requestOptions.body),
                'request.body.size': JSON.stringify(requestOptions.body).length,
                // API Response details
                'http.status_code': 200,
                'response.body': responseBody,
                'response.body.size': responseBody.length,
              },
            });
          } catch (requestError: any) {
            cloudTracer.completeOperation(traceId, {
              success: false,
              error: {
                message: requestError.message,
                type: requestError.name || 'Error',
                code: requestError.statusCode?.toString() || requestError.code || 'UNKNOWN',
                statusCode: requestError.statusCode || 0,
              },
            });

            const is404 =
              requestError.statusCode === 404 ||
              (typeof requestError.description === 'string' &&
                requestError.description.includes('404')) ||
              (requestError.context?.data?.detail &&
                requestError.context.data.detail.toLowerCase().includes('does not exist'));
            // Treat 404 Not Found as success (project does not exist - auto-create)
            if (is404) {
              const createTraceId = cloudTracer.startOperation('project', 'create', {
                orgId,
                projectId,
              });

              const description = this.getNodeParameter('description', i) as string;
              const reranker = this.getNodeParameter('reranker', i) as string;
              const embedder = this.getNodeParameter('embedder', i) as string;

              const createOptions: IHttpRequestOptions = {
                method: 'POST',
                baseURL,
                url: '/projects',
                body: {
                  org_id: orgId.trim(),
                  project_id: projectId.trim(),
                  description: description || 'Auto-created by n8n workflow',
                  config: {
                    reranker: reranker ?? '',
                    embedder: embedder ?? '',
                  },
                },
                json: true,
                timeout: 30000,
              };

              // Auto-create the project
              response = await this.helpers.httpRequestWithAuthentication.call(
                this,
                'memMachineApi',
                createOptions,
              );

              const responseBody = JSON.stringify(response || { success: true });
              cloudTracer.completeOperation(createTraceId, {
                success: true,
                metadata: {
                  created: true,
                  // API Request details
                  'http.method': 'POST',
                  'http.url': `${baseURL}/projects`,
                  'http.target': '/projects',
                  'request.body': JSON.stringify(createOptions.body),
                  'request.body.size': JSON.stringify(createOptions.body).length,
                  // API Response details
                  'http.status_code': 200,
                  'response.body': responseBody,
                  'response.body.size': responseBody.length,
                },
              });
            } else {
              // Throw clear error for other project retrieval failures
              throw new NodeOperationError(
                this.getNode(),
                `Failed to retrieve project '${projectId}' in organization '${orgId}': ${requestError.message}`,
                { itemIndex: i },
              );
            }
          }

          const responseData = response as IDataObject;
          returnData.push({
            json: {
              ...items[i]?.json,
              orgId: responseData.org_id,
              projectId: responseData.project_id,
              apiResponse: responseData,
            },
            pairedItem: { item: i },
          });
        } else if (operation === 'delete') {
          const credentials = await this.getCredentials('memMachineApi');
          const baseURL = credentials.apiEndpoint as string;

          traceId = cloudTracer.startOperation('project', 'delete', {
            orgId,
            projectId,
          });

          const deleteOptions: IHttpRequestOptions = {
            method: 'POST',
            baseURL,
            url: '/projects/delete',
            body: {
              org_id: orgId.trim(),
              project_id: projectId.trim(),
            },
            json: true,
            timeout: 30000,
          };

          try {
            await this.helpers.httpRequestWithAuthentication.call(
              this,
              'memMachineApi',
              deleteOptions,
            );

            const responseBody = JSON.stringify({ success: true });
            cloudTracer.completeOperation(traceId, {
              success: true,
              metadata: {
                deleted: true,
                // API Request details
                'http.method': 'POST',
                'http.url': `${baseURL}/projects/delete`,
                'http.target': '/projects/delete',
                'request.body': JSON.stringify(deleteOptions.body),
                'request.body.size': JSON.stringify(deleteOptions.body).length,
                // API Response details
                'http.status_code': 204,
                'response.body': responseBody,
                'response.body.size': responseBody.length,
              },
            });
          } catch (requestError: any) {
            // Throw clear error for other project deletion failures
            throw new NodeOperationError(
              this.getNode(),
              `Failed to delete project '${projectId}' in organization '${orgId}': ${requestError.message}`,
              { itemIndex: i },
            );
          }

          returnData.push({
            json: {
              orgId,
              projectId,
              deleted: true,
              apiResponse: undefined,
            },
            pairedItem: { item: i },
          });
        } else {
          // Build session context
          const session = {
            group_id: this.getNodeParameter('groupId', i) as string,
            agent_id: (this.getNodeParameter('agentId', i) as string)
              .split(',')
              .map((id) => id.trim()),
            user_id: (this.getNodeParameter('userId', i) as string)
              .split(',')
              .map((id) => id.trim()),
            session_id: projectId, // Use projectId as session identifier
          };

          if (operation === 'store') {
            // T027: Start cloud-compliant trace
            traceId = cloudTracer.startOperation('memory', 'store', {
              sessionId: session.session_id,
              groupId: session.group_id,
              userId: Array.isArray(session.user_id) ? session.user_id.join(',') : session.user_id,
              agentId: Array.isArray(session.agent_id)
                ? session.agent_id.join(',')
                : session.agent_id,
            });

            // Store operation - start tracing span
            operationSpan = tracer.startSpan('memory.store', {
              attributes: {
                'operation.type': 'store',
                'session.id': session.session_id,
                'user.id': Array.isArray(session.user_id)
                  ? session.user_id.join(',')
                  : session.user_id,
                'agent.id': Array.isArray(session.agent_id)
                  ? session.agent_id.join(',')
                  : session.agent_id,
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
                  {
                    itemIndex: i,
                  },
                );
              }
            }

            const credentials = await this.getCredentials('memMachineApi');
            const baseURL = credentials.apiEndpoint as string;

            // T013-T016: Transform request body to v2 format (messages array with producer/produced_for)
            const requestOptions: IHttpRequestOptions = {
              method: 'POST',
              baseURL,
              url: '/memories',
              body: {
                org_id: orgId.trim(),
                project_id: projectId.trim(),
                messages: [
                  {
                    content: episodeContent,
                    producer,
                    produced_for: producedFor,
                    role: producer.includes('agent') ? 'assistant' : 'user',
                    metadata: {
                      session_id: session.session_id,
                      agent_id: Array.isArray(session.agent_id)
                        ? session.agent_id[0]
                        : session.agent_id,
                      user_id: Array.isArray(session.user_id)
                        ? session.user_id[0]
                        : session.user_id,
                      group_id: session.group_id,
                      ...metadata,
                    },
                  },
                ],
              },
              json: true,
              timeout: 30000, // 30 second timeout
            };

            // Debug: Request verification (v2 format with org_id/project_id and messages array)

            // T017: Add tracing events for v2 request details
            tracer.addEvent(operationSpan, 'memmachine.store.request.headers', {
              'Content-Type': 'application/json',
            });

            tracer.addEvent(operationSpan, 'memmachine.store.request.payload', {
              'payload.org_id': orgId,
              'payload.project_id': projectId,
              'payload.messages[0].producer': producer,
              'payload.produced_for': producedFor,
              'payload.episode_content':
                episodeContent.length > 200
                  ? episodeContent.substring(0, 200) + '...'
                  : episodeContent,
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
              'http.url': `${baseURL}/memories`,
              'http.target': '/memories',
              ...headerLogKV,
              body: JSON.stringify(requestOptions.body),
            });

            // T040-T047: Implement auto-creation with 404 detection and retry
            let response: any;
            try {
              response = await this.helpers.httpRequestWithAuthentication.call(
                this,
                'memMachineApi',
                requestOptions,
              );
            } catch (error: any) {
              // Log detailed error for debugging 422 validation errors
              const errorDetails = {
                statusCode: error.statusCode,
                message: error.message,
                body: error.response?.body || error.cause?.response?.body,
                requestBody: requestOptions.body,
              };
              throw new NodeOperationError(
                this.getNode(),
                `MemMachine API error (${error.statusCode}): ${JSON.stringify(errorDetails, null, 2)}`,
                { itemIndex: i },
              );
            }

            // Add response received event with structured KV logs
            const responseBody = JSON.stringify(response || { success: true });
            tracer.addEvent(operationSpan, 'response.received', {
              'http.status_code': 200,
              'http.status_text': 'OK',
              body: responseBody,
              'body.size': responseBody.length,
            });

            // Store endpoint returns null on success - pass input data along
            const storeResult = response
              ? (response as IDataObject)
              : { success: true, stored: true };

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
                'http.url': `${baseURL}/memories`,
                'http.target': '/memories',
                'request.body': JSON.stringify(requestOptions.body),
                'request.body.size': JSON.stringify(requestOptions.body).length,
                // API Response details
                'http.status_code': 200,
                'response.body': responseBody,
                'response.body.size': responseBody.length,
              },
            });

            returnData.push({
              json: {
                ...items[i]?.json,
                ...storeResult,
              },
              pairedItem: { item: i },
            });
          } else if (operation === 'enrich') {
            // T027: Start cloud-compliant trace
            traceId = cloudTracer.startOperation('memory', 'enrich', {
              sessionId: session.session_id,
              groupId: session.group_id,
              userId: Array.isArray(session.user_id) ? session.user_id.join(',') : session.user_id,
              agentId: Array.isArray(session.agent_id)
                ? session.agent_id.join(',')
                : session.agent_id,
            });

            // Enrich operation - start tracing span
            operationSpan = tracer.startSpan('memory.enrich', {
              attributes: {
                'operation.type': 'enrich',
                'session.id': session.session_id,
                'user.id': Array.isArray(session.user_id)
                  ? session.user_id.join(',')
                  : session.user_id,
                'agent.id': Array.isArray(session.agent_id)
                  ? session.agent_id.join(',')
                  : session.agent_id,
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
              filter['metadata.session_id'] = session.session_id;
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
                  {
                    itemIndex: i,
                  },
                );
              }
            }

            const credentials = await this.getCredentials('memMachineApi');
            const baseURL = credentials.apiEndpoint as string;

            // T020-T022: Transform search request to v2 format (org_id/project_id, types array, filter)
            const searchBody: any = {
              org_id: orgId.trim(),
              project_id: projectId.trim(),
              query: query || '', // Required field, use empty string if not provided
              types: [], // Empty array to get all memory types (episodic + semantic)
              top_k: limit,
              filter: Object.entries(filter || {})
                .map(([key, value]) => `${key}=${value}`)
                .join(' AND '),
            };

            const requestOptions: IHttpRequestOptions = {
              method: 'POST',
              baseURL,
              url: '/memories/search',
              body: searchBody,
              json: true,
              timeout: 30000, // 30 second timeout
            };

            // T025: Add tracing events for v2 request details
            tracer.addEvent(operationSpan, 'memmachine.search.request.headers', {
              'Content-Type': 'application/json',
            });

            tracer.addEvent(operationSpan, 'memmachine.search.request.payload', {
              'payload.org_id': orgId,
              'payload.project_id': projectId,
              'payload.query': query,
              'payload.top_k': limit,
              'payload.types': JSON.stringify(['episodic']),
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
              'http.url': `${baseURL}/memories/search`,
              'http.target': '/memories/search',
              ...headerLogKV,
              body: JSON.stringify(requestOptions.body),
            });

            const response = await this.helpers.httpRequestWithAuthentication.call(
              this,
              'memMachineApi',
              requestOptions,
            );

            // T023: Extract memories from v2 response (handle both formats)
            const responseData = response as IDataObject;
            let rawMemories: any[] = [];
            let episodicMemoriesRaw: any[] = [];
            let profileMemoriesRaw: any[] = [];
            let shortTermEpisodesRaw: any[] = [];
            let longTermEpisodesRaw: any[] = [];

            // Check if response has flat memories array (documented v2 format)
            if (responseData.memories && Array.isArray(responseData.memories)) {
              rawMemories = responseData.memories;
              episodicMemoriesRaw = rawMemories.filter((m: any) => m.type === 'episodic');
              profileMemoriesRaw = rawMemories.filter((m: any) => m.type === 'profile');
            }
            // Check if response has nested content structure (actual API response)
            else if (responseData.content && typeof responseData.content === 'object') {
              const content = responseData.content as any;

              // Extract episodic memories from nested structure
              if (content.episodic_memory) {
                const episodicMem = content.episodic_memory;

                // Collect episodes from short_term_memory (keep separate)
                if (episodicMem.short_term_memory?.episodes) {
                  shortTermEpisodesRaw = episodicMem.short_term_memory.episodes;
                  episodicMemoriesRaw.push(...shortTermEpisodesRaw);
                }

                // Collect episodes from long_term_memory (keep separate)
                if (episodicMem.long_term_memory?.episodes) {
                  longTermEpisodesRaw = episodicMem.long_term_memory.episodes;
                  episodicMemoriesRaw.push(...longTermEpisodesRaw);
                }
              }

              // Extract semantic/profile memories
              if (content.semantic_memory && Array.isArray(content.semantic_memory)) {
                profileMemoriesRaw = content.semantic_memory;
              }

              rawMemories = [...episodicMemoriesRaw, ...profileMemoriesRaw];
            }

            // Extract episode summary from short-term memory
            let episodeSummary: string[] = [];
            if (responseData.content && typeof responseData.content === 'object') {
              const content = responseData.content as any;
              if (
                content.episodic_memory?.short_term_memory?.episode_summary &&
                Array.isArray(content.episodic_memory.short_term_memory.episode_summary)
              ) {
                episodeSummary = content.episodic_memory.short_term_memory.episode_summary.filter(
                  (s: string) => s && s.trim() !== '',
                );
              }
            }

            // Add response metrics to span
            tracer.addAttributes(operationSpan, {
              'memmachine.response.total_count': rawMemories.length,
              'memmachine.response.episodic_count': episodicMemoriesRaw.length,
              'memmachine.response.profile_count': profileMemoriesRaw.length,
            });

            // Add response received event with structured KV logs
            const responseBody = JSON.stringify(responseData);
            tracer.addEvent(operationSpan, 'response.received', {
              'http.status_code': 200,
              'http.status_text': 'OK',
              body:
                responseBody.length > 5000
                  ? responseBody.substring(0, 5000) + '...[truncated]'
                  : responseBody,
              'body.size': responseBody.length,
            });

            // T023: Transform memories to internal structure (handle both formats)
            const flattenedMemories: any[] = [];
            const seenEpisodes = new Set<string>(); // Track seen episodes to avoid duplicates

            if (Array.isArray(episodicMemoriesRaw)) {
              for (const memory of episodicMemoriesRaw) {
                if (memory && typeof memory === 'object') {
                  let content = '';
                  let producer = 'unknown';
                  let producedFor = 'unknown';
                  let episodeType = 'dialog';
                  let timestamp = memory.created_at || new Date().toISOString();
                  let uuid = memory.id || memory.uid || '';
                  let metadata = {};

                  // Handle flat v2 format (with messages array)
                  if (Array.isArray(memory.messages) && memory.messages.length > 0) {
                    content = memory.messages[0].content || '';
                    producer = memory.messages[0].producer || 'unknown';
                    producedFor = memory.messages[0].produced_for || 'unknown';
                    metadata = memory.messages[0].metadata || {};
                  }
                  // Handle nested format (direct content field)
                  else if (memory.content) {
                    content = memory.content;
                    producer = memory.producer_id || memory.producer || 'unknown';
                    producedFor = memory.produced_for_id || memory.produced_for || 'unknown';
                    episodeType = memory.episode_type || 'message';
                    metadata = memory.metadata || {};
                  }

                  if (content && content.trim() !== '') {
                    // Create unique key for deduplication (content + producer + producedFor)
                    const episodeKey = `${content}|${producer}|${producedFor}`;

                    // Skip if we've already seen this exact episode
                    if (!seenEpisodes.has(episodeKey)) {
                      seenEpisodes.add(episodeKey);
                      flattenedMemories.push({
                        episode_content: content,
                        producer,
                        produced_for: producedFor,
                        episode_type: episodeType,
                        timestamp,
                        uuid,
                        content_type: 'text',
                        group_id: session.group_id,
                        session_id: session.session_id,
                        user_metadata: metadata,
                      });
                    }
                  }
                }
              }
            }

            const episodicMemories = flattenedMemories as EpisodicMemoryItem[];

            // Transform semantic memory to profile memory structure
            // Semantic memory has: set_id, category, tag, feature_name, value, metadata
            const profileMemoryFacts: any[] = [];
            const deduplicatedSemanticMemory: any[] = [];
            const seenFacts = new Set<string>(); // Track seen combinations to avoid duplicates

            if (Array.isArray(profileMemoriesRaw)) {
              for (const memory of profileMemoriesRaw) {
                if (memory && typeof memory === 'object') {
                  // Semantic memory structure: tag, feature_name, value
                  const tag = memory.tag || 'General';
                  const featureName = memory.feature_name || 'property';
                  const value = memory.value || '';

                  // Create unique key for deduplication
                  const factKey = `${tag}|${featureName}|${value}`;

                  // Skip if we've already seen this exact fact
                  if (!seenFacts.has(factKey) && value.trim() !== '') {
                    seenFacts.add(factKey);

                    // Add to both structured format (for profileMemory) and raw format (for template)
                    profileMemoryFacts.push({
                      subject: tag,
                      predicate: featureName,
                      object: value,
                      confidence: memory.metadata?.similarity_score,
                      source: `id_${memory.metadata?.id || 'unknown'}`,
                    });

                    deduplicatedSemanticMemory.push(memory);
                  }
                }
              }
            }

            const profileMemory: ProfileMemoryFacts = {
              facts: profileMemoryFacts,
              entities: {},
            };

            // Create categorized structure based on API response buckets
            let categorized: CategorizedMemories;
            if (shortTermEpisodesRaw.length > 0 || longTermEpisodesRaw.length > 0) {
              // API provided pre-categorized data, use it directly
              const shortTermMemories = episodicMemories.filter((m) =>
                shortTermEpisodesRaw.some((raw) => raw.uid === m.uuid || raw.id === m.uuid),
              );
              const longTermMemories = episodicMemories.filter((m) =>
                longTermEpisodesRaw.some((raw) => raw.uid === m.uuid || raw.id === m.uuid),
              );

              categorized = {
                history: [], // Not used in v2 template
                shortTermMemory: shortTermMemories,
                longTermMemory: longTermMemories,
              };
            } else {
              // Fallback to time-based categorization for flat format
              categorized = categorizeMemories(episodicMemories, historyCount, shortTermCount);
            }

            // Render template if enabled (US3)
            let context = '';
            if (enableTemplate) {
              try {
                context = renderTemplate(
                  contextTemplate,
                  categorized,
                  profileMemory,
                  deduplicatedSemanticMemory,
                  episodeSummary,
                );
              } catch (error) {
                if (this.continueOnFail()) {
                  context = `*Template rendering failed: ${(error as Error).message}*`;
                } else {
                  throw new NodeOperationError(
                    this.getNode(),
                    `Failed to render context template: ${(error as Error).message}`,
                    {
                      itemIndex: i,
                    },
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
                renderedContext:
                  enableTemplate && context.length > 0
                    ? context.length > 2000
                      ? context.substring(0, 2000) + '\n\n...[truncated]'
                      : context
                    : '',
                // API Request details
                'http.method': 'POST',
                'http.url': `${baseURL}/memories/search`,
                'http.target': '/memories/search',
                'request.body': JSON.stringify(requestOptions.body),
                'request.body.size': JSON.stringify(requestOptions.body).length,
                'request.query': query,
                'request.limit': limit,
                // API Response details
                'http.status_code': 200,
                'response.body': responseBody,
                'response.body.size': responseBody.length,
                'response.episodic_count': episodicMemories.length,
                'response.profile_count': profileMemory.facts ? profileMemory.facts.length : 0,
              },
            });

            returnData.push({
              json: {
                ...items[i]?.json,
                episodic_memory: episodicMemories,
                history: categorized.history,
                shortTermMemory: categorized.shortTermMemory,
                longTermMemory: categorized.longTermMemory,
                semantic_memory: deduplicatedSemanticMemory,
                profileMemory,
                context,
                totalResults: episodicMemories.length,
                apiResponse: responseData,
              },
              pairedItem: { item: i },
            });
          }
        }
      } catch (error: any) {
        // Record detailed error information in span
        tracer.addEvent(operationSpan, 'error', {
          'error.type': error.name || 'Error',
          'error.message': error.message,
          'error.statusCode': error.statusCode || 0,
          'error.cause': error.cause ? JSON.stringify(error.cause).substring(0, 500) : '',
        });
        tracer.addAttributes(operationSpan, {
          error: true,
          'error.type': error.name || 'Error',
          'error.message': error.message,
          'http.status_code': error.statusCode || 0,
        });

        // End span with error if tracing is enabled
        tracer.endSpanWithError(operationSpan, error as Error);

        // T029: Complete cloud trace on error with detailed information
        if (traceId) {
          cloudTracer.completeOperation(traceId, {
            success: false,
            error: {
              message: error.message,
              type: error.name || 'Error',
              code: error.statusCode?.toString() || error.code || 'UNKNOWN',
              statusCode: error.statusCode || 0,
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

    // T019: Export traces to Jaeger if enabled (without adding to workflow output)
    if (cloudTracer.isEnabled()) {
      const exportToJaeger = this.getNodeParameter('exportToJaeger', 0, false) as boolean;

      if (exportToJaeger) {
        const jaegerEndpoint = this.getNodeParameter(
          'jaegerOtlpEndpoint',
          0,
          'http://jaeger:4318/v1/traces',
        ) as string;

        // Fire and forget - export traces without blocking workflow
        cloudTracer.exportTracesToJaeger(jaegerEndpoint).catch((error: Error) => {
          // Silently log error without adding to output
          void error;
        });
      }
    }

    // Return: [main output with data, ai_memory output empty (provided via supplyData)]
    return [returnData];
  }
}
