"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Memory = exports.MemMachine = void 0;
const n8n_workflow_1 = require("n8n-workflow");
const categorizeMemories_1 = require("./utils/categorizeMemories");
const renderTemplate_1 = require("./utils/renderTemplate");
const MemMachineMemory_1 = require("./MemMachineMemory");
const tracer_1 = require("./utils/tracer");
class MemMachine {
    description = {
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
                                url: '/api/v2/memories',
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
                                url: '/api/v2/memories/search',
                            },
                        },
                    },
                ],
                default: 'store',
            },
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
                default: `# Memory Context

**Instructions**: Use semantic memory as ground truth about the user. Enrich your understanding with short-term memory for recent context and long-term memory for historical patterns.

## User Profile (Semantic Memory)
{{semanticMemory}}

## Recent Context (Short-Term Memory)
{{shortTermMemory}}

{{episodeSummary}}

## Historical Context (Long-Term Memory)
{{longTermMemory}}`,
                description: 'Template for formatting memory context with semantic features, short-term, and long-term episodes',
                hint: 'Semantic memory provides verified facts, short-term provides recent context, long-term provides historical patterns',
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
            {
                displayName: 'Organization ID',
                name: 'orgId',
                type: 'string',
                default: 'group_v1',
                required: true,
                placeholder: 'group_v1',
                description: 'Organization identifier for MemMachine API v2. All projects belong to an organization.',
                hint: 'Required for v2 API - defines the top-level tenant for memory storage',
            },
            {
                displayName: 'Project ID',
                name: 'projectId',
                type: 'string',
                default: '={{$json.sessionId}}',
                required: true,
                placeholder: '={{$json.sessionId}}',
                description: 'Project identifier for memory isolation. Projects are automatically created if they don\'t exist.',
                hint: 'Required for v2 API - all memories are stored within a project. Auto-created on first use with default configuration.',
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
                default: 'user_v1',
                required: true,
                placeholder: 'user_v1',
                description: 'User identifier (can be comma-separated for multiple users)',
            },
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
                default: '={{$parameter.userId}}',
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
                default: '={{$parameter.agentId}}',
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
                default: `# Memory Context

**Instructions**: Use semantic memory as ground truth about the user. Enrich your understanding with short-term memory for recent context and long-term memory for historical patterns.

## User Profile (Semantic Memory)
{{semanticMemory}}

## Recent Context (Short-Term Memory)
{{shortTermMemory}}

{{episodeSummary}}

## Historical Context (Long-Term Memory)
{{longTermMemory}}`,
                description: 'Markdown template for formatting memory context with semantic features, short-term, and long-term episodes',
                hint: 'Semantic memory provides verified facts, short-term provides recent context, long-term provides historical patterns',
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
    async execute() {
        const items = this.getInputData();
        const returnData = [];
        const operation = this.getNodeParameter('operation', 0);
        const tracer = new tracer_1.MemoryTracer({
            enabled: false,
            format: 'json',
            verbosity: 'minimal',
            maxEntrySize: 10240,
        });
        const cloudTracingEnabled = this.getNodeParameter('tracingEnabled', 0, false);
        const cloudTraceFormat = this.getNodeParameter('traceFormat', 0, 'json');
        const cloudTraceVerbosity = this.getNodeParameter('traceVerbosity', 0, 'normal');
        const cloudTracer = new tracer_1.MemoryTracer({
            enabled: cloudTracingEnabled,
            format: cloudTraceFormat,
            verbosity: cloudTraceVerbosity,
            maxEntrySize: 10240,
        });
        for (let i = 0; i < items.length; i++) {
            let operationSpan = undefined;
            let traceId = '';
            try {
                const orgId = this.getNodeParameter('orgId', i);
                const projectId = this.getNodeParameter('projectId', i);
                if (!orgId || orgId.trim() === '') {
                    throw new n8n_workflow_1.NodeOperationError(this.getNode(), 'MemMachine API v2 requires organization ID. Please provide a valid organization identifier.', { itemIndex: i });
                }
                if (!projectId || projectId.trim() === '') {
                    throw new n8n_workflow_1.NodeOperationError(this.getNode(), 'MemMachine API v2 requires project ID. Please provide a valid project identifier. Projects are automatically created if they don\'t exist.', { itemIndex: i });
                }
                const session = {
                    group_id: this.getNodeParameter('groupId', i),
                    agent_id: this.getNodeParameter('agentId', i).split(',').map((id) => id.trim()),
                    user_id: this.getNodeParameter('userId', i).split(',').map((id) => id.trim()),
                    session_id: projectId,
                };
                if (operation === 'store') {
                    traceId = cloudTracer.startOperation('store', {
                        sessionId: session.session_id,
                        groupId: session.group_id,
                        userId: Array.isArray(session.user_id) ? session.user_id.join(',') : session.user_id,
                        agentId: Array.isArray(session.agent_id) ? session.agent_id.join(',') : session.agent_id,
                    });
                    operationSpan = tracer.startSpan('memory.store', {
                        attributes: {
                            'operation.type': 'store',
                            'session.id': session.session_id,
                            'user.id': Array.isArray(session.user_id) ? session.user_id.join(',') : session.user_id,
                            'agent.id': Array.isArray(session.agent_id) ? session.agent_id.join(',') : session.agent_id,
                        },
                    });
                    const producer = this.getNodeParameter('producer', i);
                    const producedFor = this.getNodeParameter('producedFor', i);
                    const episodeContent = this.getNodeParameter('episodeContent', i);
                    const episodeType = this.getNodeParameter('episodeType', i);
                    const metadataStr = this.getNodeParameter('metadata', i);
                    let metadata = {};
                    if (metadataStr && metadataStr.trim() !== '{}' && metadataStr.trim() !== '') {
                        try {
                            metadata = JSON.parse(metadataStr);
                        }
                        catch (error) {
                            throw new n8n_workflow_1.NodeOperationError(this.getNode(), `Invalid metadata JSON: ${error.message}`, { itemIndex: i });
                        }
                    }
                    const credentials = await this.getCredentials('memMachineApi');
                    const baseURL = credentials.apiEndpoint;
                    const requestOptions = {
                        method: 'POST',
                        baseURL,
                        url: '/api/v2/memories',
                        headers: {
                            'session-id': session.session_id,
                        },
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
                                        ...metadata,
                                        agent_id: Array.isArray(session.agent_id) ? session.agent_id[0] : session.agent_id,
                                        user_id: Array.isArray(session.user_id) ? session.user_id[0] : session.user_id,
                                    },
                                },
                            ],
                        },
                        json: true,
                        timeout: 30000,
                    };
                    tracer.addEvent(operationSpan, 'memmachine.store.request.headers', {
                        'Content-Type': 'application/json',
                    });
                    tracer.addEvent(operationSpan, 'memmachine.store.request.payload', {
                        'payload.org_id': orgId,
                        'payload.project_id': projectId,
                        'payload.messages[0].producer': producer,
                        'payload.produced_for': producedFor,
                        'payload.episode_content': episodeContent.length > 200 ? episodeContent.substring(0, 200) + '...' : episodeContent,
                        'payload.episode_type': episodeType,
                        'payload.metadata': JSON.stringify(metadata),
                    });
                    const requestHeaders = requestOptions.headers || {};
                    const headerLogKV = {};
                    for (const [key, value] of Object.entries(requestHeaders)) {
                        headerLogKV[`header.${key}`] = String(value);
                    }
                    tracer.addEvent(operationSpan, 'request.send', {
                        'http.method': 'POST',
                        'http.url': `${baseURL}/api/v2/memories`,
                        'http.target': '/api/v2/memories',
                        ...headerLogKV,
                        'body': JSON.stringify(requestOptions.body),
                    });
                    let response;
                    try {
                        response = await this.helpers.httpRequestWithAuthentication.call(this, 'memMachineApi', requestOptions);
                    }
                    catch (error) {
                        const errorDetails = {
                            statusCode: error.statusCode,
                            message: error.message,
                            body: error.response?.body || error.cause?.response?.body,
                            requestBody: requestOptions.body,
                        };
                        throw new n8n_workflow_1.NodeOperationError(this.getNode(), `MemMachine API error (${error.statusCode}): ${JSON.stringify(errorDetails, null, 2)}`, { itemIndex: i });
                        if (error.statusCode === 404 && error.message && error.message.toLowerCase().includes('project')) {
                            const createProjectOptions = {
                                method: 'POST',
                                baseURL,
                                url: '/api/v2/projects',
                                body: {
                                    org_id: orgId.trim(),
                                    project_id: projectId.trim(),
                                    description: 'Auto-created by n8n workflow',
                                    config: {
                                        reranker: 'default',
                                        embedder: 'default',
                                    },
                                },
                                json: true,
                                timeout: 30000,
                            };
                            try {
                                cloudTracer.addEvent(traceId, 'project.auto_create', {
                                    org_id: orgId,
                                    project_id: projectId,
                                    description: 'Auto-created by n8n workflow',
                                });
                                await this.helpers.httpRequestWithAuthentication.call(this, 'memMachineApi', createProjectOptions);
                                response = await this.helpers.httpRequestWithAuthentication.call(this, 'memMachineApi', requestOptions);
                            }
                            catch (createError) {
                                if (createError.statusCode === 409) {
                                    response = await this.helpers.httpRequestWithAuthentication.call(this, 'memMachineApi', requestOptions);
                                }
                                else {
                                    throw new n8n_workflow_1.NodeOperationError(this.getNode(), `Failed to auto-create project '${projectId}' in organization '${orgId}': ${createError.message}`, { itemIndex: i });
                                }
                            }
                        }
                        else {
                            throw error;
                        }
                    }
                    const responseBody = JSON.stringify(response || { success: true });
                    tracer.addEvent(operationSpan, 'response.received', {
                        'http.status_code': 200,
                        'http.status_text': 'OK',
                        'body': responseBody,
                        'body.size': responseBody.length,
                    });
                    const storeResult = response ? response : { success: true, stored: true };
                    tracer.addAttributes(operationSpan, {
                        'message.length': episodeContent.length,
                    });
                    tracer.endSpan(operationSpan);
                    cloudTracer.completeOperation(traceId, {
                        success: true,
                        metadata: {
                            messageLength: episodeContent.length,
                            episodeType,
                            stored: true,
                            'http.method': 'POST',
                            'http.url': `${baseURL}/v1/memories`,
                            'http.target': '/v1/memories',
                            'request.body': JSON.stringify(requestOptions.body),
                            'request.body.size': JSON.stringify(requestOptions.body).length,
                            'http.status_code': 200,
                            'response.body': responseBody,
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
                }
                else if (operation === 'enrich') {
                    traceId = cloudTracer.startOperation('enrich', {
                        sessionId: session.session_id,
                        groupId: session.group_id,
                        userId: Array.isArray(session.user_id) ? session.user_id.join(',') : session.user_id,
                        agentId: Array.isArray(session.agent_id) ? session.agent_id.join(',') : session.agent_id,
                    });
                    operationSpan = tracer.startSpan('memory.enrich', {
                        attributes: {
                            'operation.type': 'enrich',
                            'session.id': session.session_id,
                            'user.id': Array.isArray(session.user_id) ? session.user_id.join(',') : session.user_id,
                            'agent.id': Array.isArray(session.agent_id) ? session.agent_id.join(',') : session.agent_id,
                        },
                    });
                    const query = this.getNodeParameter('query', i);
                    const limit = this.getNodeParameter('limit', i);
                    const filterBySession = this.getNodeParameter('filterBySession', i, true);
                    const filterStr = this.getNodeParameter('filter', i);
                    const enableTemplate = this.getNodeParameter('enableTemplate', i, true);
                    const contextTemplate = this.getNodeParameter('contextTemplate', i);
                    const advancedOptions = this.getNodeParameter('advancedOptions', i, {});
                    const historyCount = advancedOptions.historyCount || 5;
                    const shortTermCount = advancedOptions.shortTermCount || 10;
                    let filter = {};
                    if (filterBySession) {
                        filter.session_id = session.session_id;
                    }
                    if (filterStr && filterStr.trim() !== '{}' && filterStr.trim() !== '') {
                        try {
                            const customFilter = JSON.parse(filterStr);
                            filter = { ...filter, ...customFilter };
                        }
                        catch (error) {
                            throw new n8n_workflow_1.NodeOperationError(this.getNode(), `Invalid filter JSON: ${error.message}`, { itemIndex: i });
                        }
                    }
                    const credentials = await this.getCredentials('memMachineApi');
                    const baseURL = credentials.apiEndpoint;
                    const searchBody = {
                        org_id: orgId.trim(),
                        project_id: projectId.trim(),
                        query: query || '',
                        types: [],
                        top_k: limit,
                        filter: '',
                    };
                    const requestOptions = {
                        method: 'POST',
                        baseURL,
                        url: '/api/v2/memories/search',
                        headers: {
                            'session-id': session.session_id,
                        },
                        body: searchBody,
                        json: true,
                        timeout: 30000,
                    };
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
                    const requestHeaders = requestOptions.headers || {};
                    const headerLogKV = {};
                    for (const [key, value] of Object.entries(requestHeaders)) {
                        headerLogKV[`header.${key}`] = String(value);
                    }
                    tracer.addEvent(operationSpan, 'request.send', {
                        'http.method': 'POST',
                        'http.url': `${baseURL}/api/v2/memories/search`,
                        'http.target': '/api/v2/memories/search',
                        ...headerLogKV,
                        'body': JSON.stringify(requestOptions.body),
                    });
                    const response = await this.helpers.httpRequestWithAuthentication.call(this, 'memMachineApi', requestOptions);
                    const responseData = response;
                    let rawMemories = [];
                    let episodicMemoriesRaw = [];
                    let profileMemoriesRaw = [];
                    let shortTermEpisodesRaw = [];
                    let longTermEpisodesRaw = [];
                    if (responseData.memories && Array.isArray(responseData.memories)) {
                        rawMemories = responseData.memories;
                        episodicMemoriesRaw = rawMemories.filter((m) => m.type === 'episodic');
                        profileMemoriesRaw = rawMemories.filter((m) => m.type === 'profile');
                    }
                    else if (responseData.content && typeof responseData.content === 'object') {
                        const content = responseData.content;
                        if (content.episodic_memory) {
                            const episodicMem = content.episodic_memory;
                            if (episodicMem.short_term_memory?.episodes) {
                                shortTermEpisodesRaw = episodicMem.short_term_memory.episodes;
                                episodicMemoriesRaw.push(...shortTermEpisodesRaw);
                            }
                            if (episodicMem.long_term_memory?.episodes) {
                                longTermEpisodesRaw = episodicMem.long_term_memory.episodes;
                                episodicMemoriesRaw.push(...longTermEpisodesRaw);
                            }
                        }
                        if (content.semantic_memory && Array.isArray(content.semantic_memory)) {
                            profileMemoriesRaw = content.semantic_memory;
                        }
                        rawMemories = [...episodicMemoriesRaw, ...profileMemoriesRaw];
                    }
                    let episodeSummary = [];
                    if (responseData.content && typeof responseData.content === 'object') {
                        const content = responseData.content;
                        if (content.episodic_memory?.short_term_memory?.episode_summary &&
                            Array.isArray(content.episodic_memory.short_term_memory.episode_summary)) {
                            episodeSummary = content.episodic_memory.short_term_memory.episode_summary
                                .filter((s) => s && s.trim() !== '');
                        }
                    }
                    tracer.addAttributes(operationSpan, {
                        'memmachine.response.total_count': rawMemories.length,
                        'memmachine.response.episodic_count': episodicMemoriesRaw.length,
                        'memmachine.response.profile_count': profileMemoriesRaw.length,
                    });
                    const responseBody = JSON.stringify(responseData);
                    tracer.addEvent(operationSpan, 'response.received', {
                        'http.status_code': 200,
                        'http.status_text': 'OK',
                        'body': responseBody.length > 5000 ? responseBody.substring(0, 5000) + '...[truncated]' : responseBody,
                        'body.size': responseBody.length,
                    });
                    const flattenedMemories = [];
                    const seenEpisodes = new Set();
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
                                if (Array.isArray(memory.messages) && memory.messages.length > 0) {
                                    content = memory.messages[0].content || '';
                                    producer = memory.messages[0].producer || 'unknown';
                                    producedFor = memory.messages[0].produced_for || 'unknown';
                                    metadata = memory.messages[0].metadata || {};
                                }
                                else if (memory.content) {
                                    content = memory.content;
                                    producer = memory.producer_id || memory.producer || 'unknown';
                                    producedFor = memory.produced_for_id || memory.produced_for || 'unknown';
                                    episodeType = memory.episode_type || 'message';
                                    metadata = memory.metadata || {};
                                }
                                if (content && content.trim() !== '') {
                                    const episodeKey = `${content}|${producer}|${producedFor}`;
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
                    const episodicMemories = flattenedMemories;
                    const profileMemoryFacts = [];
                    const deduplicatedSemanticMemory = [];
                    const seenFacts = new Set();
                    if (Array.isArray(profileMemoriesRaw)) {
                        for (const memory of profileMemoriesRaw) {
                            if (memory && typeof memory === 'object') {
                                const tag = memory.tag || 'General';
                                const featureName = memory.feature_name || 'property';
                                const value = memory.value || '';
                                const factKey = `${tag}|${featureName}|${value}`;
                                if (!seenFacts.has(factKey) && value.trim() !== '') {
                                    seenFacts.add(factKey);
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
                    const profileMemory = {
                        facts: profileMemoryFacts,
                        entities: {},
                    };
                    let categorized;
                    if (shortTermEpisodesRaw.length > 0 || longTermEpisodesRaw.length > 0) {
                        const shortTermMemories = episodicMemories.filter(m => shortTermEpisodesRaw.some(raw => raw.uid === m.uuid || raw.id === m.uuid));
                        const longTermMemories = episodicMemories.filter(m => longTermEpisodesRaw.some(raw => raw.uid === m.uuid || raw.id === m.uuid));
                        categorized = {
                            history: [],
                            shortTermMemory: shortTermMemories,
                            longTermMemory: longTermMemories,
                        };
                    }
                    else {
                        categorized = (0, categorizeMemories_1.categorizeMemories)(episodicMemories, historyCount, shortTermCount);
                    }
                    let context = '';
                    if (enableTemplate) {
                        try {
                            context = (0, renderTemplate_1.renderTemplate)(contextTemplate, categorized, profileMemory, deduplicatedSemanticMemory, episodeSummary);
                        }
                        catch (error) {
                            if (this.continueOnFail()) {
                                context = `*Template rendering failed: ${error.message}*`;
                            }
                            else {
                                throw new n8n_workflow_1.NodeOperationError(this.getNode(), `Failed to render context template: ${error.message}`, { itemIndex: i });
                            }
                        }
                    }
                    tracer.addAttributes(operationSpan, {
                        'memory.count': episodicMemories.length,
                        'template.enabled': enableTemplate,
                    });
                    tracer.endSpan(operationSpan);
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
                            renderedContext: enableTemplate && context.length > 0
                                ? (context.length > 2000 ? context.substring(0, 2000) + '\n\n...[truncated]' : context)
                                : '',
                            'http.method': 'POST',
                            'http.url': `${baseURL}/v1/memories/search`,
                            'http.target': '/v1/memories/search',
                            'request.body': JSON.stringify(requestOptions.body),
                            'request.body.size': JSON.stringify(requestOptions.body).length,
                            'request.query': query,
                            'request.limit': limit,
                            'http.status_code': 200,
                            'response.body': responseBody,
                            'response.body.size': responseBody.length,
                            'response.episodic_count': episodicMemories.length,
                            'response.profile_count': profileMemory.facts ? profileMemory.facts.length : 0,
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
            }
            catch (error) {
                tracer.addEvent(operationSpan, 'error', {
                    'error.type': error.name || 'Error',
                    'error.message': error.message,
                    'error.statusCode': error.statusCode || 0,
                    'error.cause': error.cause ? JSON.stringify(error.cause).substring(0, 500) : '',
                });
                tracer.addAttributes(operationSpan, {
                    'error': true,
                    'error.type': error.name || 'Error',
                    'error.message': error.message,
                    'http.status_code': error.statusCode || 0,
                });
                tracer.endSpanWithError(operationSpan, error);
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
                            error: error.message,
                        },
                        pairedItem: { item: i },
                    });
                    continue;
                }
                throw error;
            }
        }
        if (cloudTracer.isEnabled()) {
            const exportToJaeger = this.getNodeParameter('exportToJaeger', 0, false);
            if (exportToJaeger) {
                const jaegerEndpoint = this.getNodeParameter('jaegerOtlpEndpoint', 0, 'http://jaeger:4318/v1/traces');
                cloudTracer.exportTracesToJaeger(jaegerEndpoint).catch((error) => {
                    void error;
                });
            }
        }
        return [returnData];
    }
    async supplyData(itemIndex) {
        const tracingEnabled = this.getNodeParameter('tracingEnabled', itemIndex, false);
        const cloudTracer = new tracer_1.MemoryTracer({
            enabled: tracingEnabled,
            format: this.getNodeParameter('traceFormat', itemIndex, 'json'),
            verbosity: this.getNodeParameter('traceVerbosity', itemIndex, 'minimal'),
            maxEntrySize: 10240,
        });
        let sessionId = '';
        let traceId = '';
        try {
            const mode = this.getNodeParameter('mode', itemIndex);
            if (mode !== 'memory') {
                throw new n8n_workflow_1.NodeOperationError(this.getNode(), 'Node must be in "AI Agent Memory" mode to connect to AI Agents. Please change the Mode parameter.', { itemIndex });
            }
            const orgId = this.getNodeParameter('orgId', itemIndex);
            const projectId = this.getNodeParameter('projectId', itemIndex);
            if (!orgId || orgId.trim() === '') {
                throw new n8n_workflow_1.NodeOperationError(this.getNode(), 'MemMachine API v2 requires organization ID for AI Agent memory.', { itemIndex });
            }
            if (!projectId || projectId.trim() === '') {
                throw new n8n_workflow_1.NodeOperationError(this.getNode(), 'MemMachine API v2 requires project ID for AI Agent memory.', { itemIndex });
            }
            sessionId = this.getNodeParameter('sessionId', itemIndex);
            const groupId = this.getNodeParameter('groupId', itemIndex, 'default');
            const agentId = this.getNodeParameter('agentId', itemIndex);
            const userId = this.getNodeParameter('userId', itemIndex);
            const contextWindowLength = this.getNodeParameter('contextWindowLength', itemIndex, 10);
            const enableTemplate = this.getNodeParameter('enableMemoryTemplate', itemIndex, false);
            const contextTemplate = this.getNodeParameter('memoryContextTemplate', itemIndex, '');
            const templateOptions = this.getNodeParameter('memoryTemplateOptions', itemIndex, {});
            const historyCount = templateOptions.historyCount || 5;
            const shortTermCount = templateOptions.shortTermCount || 10;
            const credentials = await this.getCredentials('memMachineApi');
            const apiUrl = credentials.apiEndpoint;
            const apiKey = credentials.apiKey;
            const agentIdArray = agentId.split(',').map((id) => id.trim());
            const userIdArray = userId.split(',').map((id) => id.trim());
            if (!sessionId || sessionId.trim() === '') {
                throw new n8n_workflow_1.NodeOperationError(this.getNode(), 'Session ID is required for AI Agent memory. Please provide a session identifier.', { itemIndex });
            }
            if (tracingEnabled) {
                traceId = cloudTracer.startOperation('store', {
                    mode: 'ai_agent_memory',
                    sessionId: sessionId.trim(),
                    groupId,
                    agentId: agentIdArray.join(','),
                    userId: userIdArray.join(','),
                    contextWindowLength,
                    enableTemplate,
                    historyCount,
                    shortTermCount,
                });
            }
            const legacyTracer = undefined;
            const exportToJaeger = this.getNodeParameter('exportToJaeger', itemIndex, false);
            const jaegerEndpoint = this.getNodeParameter('jaegerOtlpEndpoint', itemIndex, 'http://jaeger:4318/v1/traces');
            const memory = new MemMachineMemory_1.MemMachineMemory({
                apiUrl,
                apiKey,
                orgId: orgId.trim(),
                projectId: projectId.trim(),
                groupId,
                agentId: agentIdArray,
                userId: userIdArray,
                sessionId: sessionId.trim(),
                contextWindowLength,
                enableTemplate,
                contextTemplate: enableTemplate ? contextTemplate : undefined,
                historyCount,
                shortTermCount,
                tracer: legacyTracer,
                cloudTracer: tracingEnabled ? cloudTracer : undefined,
                parentTraceId: tracingEnabled ? traceId : undefined,
                exportToJaeger: tracingEnabled && exportToJaeger,
                jaegerEndpoint: jaegerEndpoint,
                logger: {
                    info: (message, ...args) => {
                        console.log(`[MemMachineMemory] ${message}`, ...args);
                    },
                    error: (message, ...args) => {
                        console.error(`[MemMachineMemory ERROR] ${message}`, ...args);
                    },
                    warn: (message, ...args) => {
                        console.warn(`[MemMachineMemory WARN] ${message}`, ...args);
                    },
                },
            });
            console.log('[MemMachine] supplyData - Parent span started', {
                traceId,
                sessionId: sessionId.trim(),
                tracingEnabled,
            });
            console.log('[MemMachine] supplyData - Returning memory instance', {
                sessionId: sessionId.trim(),
                memoryType: memory.constructor.name,
            });
            const response = {
                response: memory,
            };
            return response;
        }
        catch (error) {
            if (tracingEnabled && traceId) {
                cloudTracer.completeOperation(traceId, {
                    success: false,
                    error: error.message,
                    metadata: {
                        mode: 'ai_agent_memory',
                        errorType: error instanceof n8n_workflow_1.NodeOperationError ? 'NodeOperationError' : 'Error',
                        sessionId: sessionId ? sessionId.trim() : 'unknown',
                    },
                });
            }
            throw new n8n_workflow_1.NodeOperationError(this.getNode(), `Failed to initialize MemMachine memory: ${error.message}`, { itemIndex });
        }
    }
}
exports.MemMachine = MemMachine;
exports.Memory = MemMachine;
//# sourceMappingURL=Memory.node.js.map