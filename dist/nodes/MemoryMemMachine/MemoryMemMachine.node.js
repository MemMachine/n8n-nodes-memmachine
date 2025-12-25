"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryMemMachine = void 0;
const n8n_workflow_1 = require("n8n-workflow");
const MemMachineMemory_1 = require("./MemMachineMemory");
const tracer_1 = require("../utils/tracer");
class MemoryMemMachine {
    description = {
        displayName: 'MemMachine Memory',
        name: 'memoryMemMachine',
        icon: 'file:../MemMachine.icon.svg',
        group: ['transform'],
        version: 1,
        description: 'Store and retrieve conversational memory using MemMachine',
        defaults: {
            name: 'MemMachine Memory',
        },
        codex: {
            categories: ['AI'],
            subcategories: {
                AI: ['Memory'],
                Memory: ['Other memories'],
            },
        },
        inputs: [],
        outputs: ['ai_memory'],
        outputNames: ['Memory'],
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
                displayName: 'Organization ID',
                name: 'orgId',
                type: 'string',
                default: '={{$json.sessionId}}',
                required: true,
                placeholder: '={{$json.sessionId}}',
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
                description: "Project identifier for memory isolation. Projects are automatically created if they don't exist.",
                hint: 'Required for v2 API - all memories are stored within a project. Auto-created on first use with default configuration.',
            },
            {
                displayName: 'Context Window Length',
                name: 'contextWindowLength',
                type: 'number',
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
                        enableMemoryTemplate: [true],
                    },
                },
                default: `# Memory Context
  
  **Instructions**: Use semantic memory as ground truth about the user. Enrich your understanding with short-term memory for recent context and long-term memory for historical patterns.
  
  ## User Profile (Semantic Memory)
  {{semanticMemory}}
  
  ## Conversation History
  {{history}}
  
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
                            minValue: 0,
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
                            minValue: 0,
                            maxValue: 50,
                        },
                        description: 'Number of items to include in short-term memory section',
                    },
                ],
            },
            {
                displayName: 'Enable Cloud Tracing',
                name: 'tracingEnabled',
                type: 'boolean',
                default: false,
                description: 'Whether to enable operation tracing for debugging and monitoring (n8n Cloud compatible)',
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
    async supplyData(itemIndex) {
        let tracingEnabled = false;
        let traceFormat = 'json';
        let traceVerbosity = 'minimal';
        try {
            tracingEnabled = this.getNodeParameter('tracingEnabled', itemIndex, false);
        }
        catch (error) {
            tracingEnabled = false;
        }
        try {
            traceFormat = this.getNodeParameter('traceFormat', itemIndex, 'json');
        }
        catch (error) {
            traceFormat = 'json';
        }
        try {
            traceVerbosity = this.getNodeParameter('traceVerbosity', itemIndex, 'minimal');
        }
        catch (error) {
            traceVerbosity = 'minimal';
        }
        const cloudTracer = new tracer_1.MemoryTracer({
            enabled: tracingEnabled,
            format: traceFormat,
            verbosity: traceVerbosity,
            maxEntrySize: 10240,
        });
        let sessionId = '';
        let traceId = '';
        try {
            let orgId;
            let projectId;
            try {
                orgId = this.getNodeParameter('orgId', itemIndex, 'group_v1');
            }
            catch (error) {
                throw new n8n_workflow_1.NodeOperationError(this.getNode(), `Failed to get 'orgId' (Organization ID) parameter: ${error.message}. Please ensure the Organization ID parameter is set correctly.`, { itemIndex });
            }
            try {
                projectId = this.getNodeParameter('projectId', itemIndex, '');
            }
            catch (error) {
                throw new n8n_workflow_1.NodeOperationError(this.getNode(), `Failed to get 'projectId' (Project ID) parameter: ${error.message}. If using an expression like {{$json.sessionId}}, ensure the input data contains sessionId. Otherwise, provide a static value.`, { itemIndex });
            }
            if (!orgId || orgId.trim() === '') {
                throw new n8n_workflow_1.NodeOperationError(this.getNode(), 'MemMachine API v2 requires organization ID for AI Agent memory. Please set the Organization ID parameter.', { itemIndex });
            }
            if (!projectId || projectId.trim() === '') {
                throw new n8n_workflow_1.NodeOperationError(this.getNode(), 'MemMachine API v2 requires project ID for AI Agent memory. Please set the Project ID parameter (e.g., use {{$json.sessionId}} or provide a static value).', { itemIndex });
            }
            sessionId = projectId.trim();
            let groupId;
            let agentId;
            let userId;
            try {
                groupId = this.getNodeParameter('groupId', itemIndex, 'default');
            }
            catch (error) {
                throw new n8n_workflow_1.NodeOperationError(this.getNode(), `Failed to get 'groupId' (Group ID) parameter: ${error.message}. Please ensure the Group ID parameter is set correctly.`, { itemIndex });
            }
            try {
                agentId = this.getNodeParameter('agentId', itemIndex, 'agent_assistant');
            }
            catch (error) {
                throw new n8n_workflow_1.NodeOperationError(this.getNode(), `Failed to get 'agentId' (Agent ID) parameter: ${error.message}. If using an expression like {{$workflow.name}}, ensure it can be evaluated. Otherwise, provide a static value.`, { itemIndex });
            }
            try {
                userId = this.getNodeParameter('userId', itemIndex, 'user_v1');
            }
            catch (error) {
                throw new n8n_workflow_1.NodeOperationError(this.getNode(), `Failed to get 'userId' (User ID) parameter: ${error.message}. Please ensure the User ID parameter is set correctly.`, { itemIndex });
            }
            let contextWindowLength;
            try {
                contextWindowLength = this.getNodeParameter('contextWindowLength', itemIndex, 10);
            }
            catch (error) {
                contextWindowLength = 10;
            }
            let enableTemplate;
            try {
                enableTemplate = this.getNodeParameter('enableMemoryTemplate', itemIndex, false);
            }
            catch (error) {
                enableTemplate = false;
            }
            let contextTemplate = '';
            let templateOptions = {};
            let historyCount = 5;
            let shortTermCount = 10;
            if (enableTemplate) {
                try {
                    contextTemplate = this.getNodeParameter('memoryContextTemplate', itemIndex, '');
                }
                catch (error) {
                    throw new n8n_workflow_1.NodeOperationError(this.getNode(), `Failed to get 'memoryContextTemplate' parameter: ${error.message}. This parameter is only available when 'Enable Context Template' is turned on. Please turn on 'Enable Context Template' or turn it off if you don't need template formatting.`, { itemIndex });
                }
                try {
                    templateOptions = this.getNodeParameter('memoryTemplateOptions', itemIndex, {});
                }
                catch (error) {
                    templateOptions = {};
                }
                historyCount = templateOptions.historyCount || 5;
                shortTermCount = templateOptions.shortTermCount || 10;
            }
            const credentials = await this.getCredentials('memMachineApi');
            const apiUrl = credentials.apiEndpoint;
            const apiKey = credentials.apiKey;
            const agentIdArray = agentId.split(',').map((id) => id.trim());
            const userIdArray = userId.split(',').map((id) => id.trim());
            if (!sessionId || sessionId.trim() === '') {
                throw new n8n_workflow_1.NodeOperationError(this.getNode(), 'Session ID is required for AI Agent memory. Please provide a session identifier.', { itemIndex });
            }
            if (tracingEnabled) {
                traceId = cloudTracer.startOperation('memory', 'store', {
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
            let exportToJaeger = false;
            let jaegerEndpoint = 'http://jaeger:4318/v1/traces';
            try {
                exportToJaeger = this.getNodeParameter('exportToJaeger', itemIndex, false);
            }
            catch (error) {
                exportToJaeger = false;
            }
            try {
                jaegerEndpoint = this.getNodeParameter('jaegerOtlpEndpoint', itemIndex, 'http://jaeger:4318/v1/traces');
            }
            catch (error) {
                jaegerEndpoint = 'http://jaeger:4318/v1/traces';
            }
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
            throw new n8n_workflow_1.NodeOperationError(this.getNode(), `Failed to initialize MemMachine memory: ${error.message}`, {
                itemIndex,
            });
        }
    }
}
exports.MemoryMemMachine = MemoryMemMachine;
//# sourceMappingURL=MemoryMemMachine.node.js.map