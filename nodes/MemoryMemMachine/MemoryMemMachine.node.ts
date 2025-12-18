import {
  type INodeType,
  type INodeTypeDescription,
  type IDataObject,
  type ISupplyDataFunctions,
  type SupplyData,
  NodeOperationError,
} from 'n8n-workflow';

import { MemMachineMemory } from './MemMachineMemory';
import { MemoryTracer } from '../utils/tracer';

export class MemoryMemMachine implements INodeType {
  description: INodeTypeDescription = {
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
    // eslint-disable-next-line n8n-nodes-base/node-class-description-inputs-wrong-regular-node
    inputs: [],
    // eslint-disable-next-line n8n-nodes-base/node-class-description-outputs-wrong
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
      // Memory Mode Parameters
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
        description:
          'Whether to format memory context using a template (provides structured history, short-term, long-term, and profile memory sections)',
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
        description:
          'Template for formatting memory context with semantic features, short-term, and long-term episodes',
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

  /**
   * Supply data method for AI Agent memory connection
   * Called when node is connected to an AI Agent's Memory port
   */
  async supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<SupplyData> {
    // Initialize cloud tracer for AI Agent mode (outside try block for error handling)
    // Use safe parameter retrieval with defaults and error handling
    let tracingEnabled = false;
    let traceFormat: 'json' | 'human' = 'json';
    let traceVerbosity: 'minimal' | 'normal' | 'verbose' = 'minimal';

    try {
      tracingEnabled = this.getNodeParameter('tracingEnabled', itemIndex, false) as boolean;
    } catch (error) {
      // Default to false if parameter can't be retrieved
      tracingEnabled = false;
    }

    try {
      traceFormat = this.getNodeParameter('traceFormat', itemIndex, 'json') as 'json' | 'human';
    } catch (error) {
      // Default to 'json' if parameter can't be retrieved
      traceFormat = 'json';
    }

    try {
      traceVerbosity = this.getNodeParameter('traceVerbosity', itemIndex, 'minimal') as
        | 'minimal'
        | 'normal'
        | 'verbose';
    } catch (error) {
      // Default to 'minimal' if parameter can't be retrieved
      traceVerbosity = 'minimal';
    }

    const cloudTracer = new MemoryTracer({
      enabled: tracingEnabled,
      format: traceFormat,
      verbosity: traceVerbosity,
      maxEntrySize: 10240, // 10KB per FR-010
    });

    let sessionId = '';
    let traceId = '';

    try {
      // T012: Extract v2 API parameters with detailed error handling
      let orgId: string;
      let projectId: string;
      try {
        orgId = this.getNodeParameter('orgId', itemIndex, 'group_v1') as string;
      } catch (error) {
        throw new NodeOperationError(
          this.getNode(),
          `Failed to get 'orgId' (Organization ID) parameter: ${(error as Error).message}. Please ensure the Organization ID parameter is set correctly.`,
          { itemIndex },
        );
      }
      try {
        projectId = this.getNodeParameter('projectId', itemIndex, '') as string;
      } catch (error) {
        throw new NodeOperationError(
          this.getNode(),
          `Failed to get 'projectId' (Project ID) parameter: ${(error as Error).message}. If using an expression like {{$json.sessionId}}, ensure the input data contains sessionId. Otherwise, provide a static value.`,
          { itemIndex },
        );
      }

      // Validate v2 API required fields
      if (!orgId || orgId.trim() === '') {
        throw new NodeOperationError(
          this.getNode(),
          'MemMachine API v2 requires organization ID for AI Agent memory. Please set the Organization ID parameter.',
          { itemIndex },
        );
      }
      if (!projectId || projectId.trim() === '') {
        throw new NodeOperationError(
          this.getNode(),
          'MemMachine API v2 requires project ID for AI Agent memory. Please set the Project ID parameter (e.g., use {{$json.sessionId}} or provide a static value).',
          { itemIndex },
        );
      }

      // Extract session context parameters with detailed error handling
      // Use projectId as session identifier (consistent with execute method)
      sessionId = projectId.trim();

      let groupId: string;
      let agentId: string;
      let userId: string;
      try {
        groupId = this.getNodeParameter('groupId', itemIndex, 'default') as string;
      } catch (error) {
        throw new NodeOperationError(
          this.getNode(),
          `Failed to get 'groupId' (Group ID) parameter: ${(error as Error).message}. Please ensure the Group ID parameter is set correctly.`,
          { itemIndex },
        );
      }
      try {
        agentId = this.getNodeParameter('agentId', itemIndex, 'agent_assistant') as string;
      } catch (error) {
        throw new NodeOperationError(
          this.getNode(),
          `Failed to get 'agentId' (Agent ID) parameter: ${(error as Error).message}. If using an expression like {{$workflow.name}}, ensure it can be evaluated. Otherwise, provide a static value.`,
          { itemIndex },
        );
      }
      try {
        userId = this.getNodeParameter('userId', itemIndex, 'user_v1') as string;
      } catch (error) {
        throw new NodeOperationError(
          this.getNode(),
          `Failed to get 'userId' (User ID) parameter: ${(error as Error).message}. Please ensure the User ID parameter is set correctly.`,
          { itemIndex },
        );
      }

      let contextWindowLength: number;
      try {
        contextWindowLength = this.getNodeParameter('contextWindowLength', itemIndex, 10) as number;
      } catch (error) {
        // Use default value if parameter can't be retrieved
        contextWindowLength = 10;
      }

      // Extract template parameters with conditional access
      // Note: memoryContextTemplate and memoryTemplateOptions are only visible when enableMemoryTemplate is true
      let enableTemplate: boolean;
      try {
        enableTemplate = this.getNodeParameter('enableMemoryTemplate', itemIndex, false) as boolean;
      } catch (error) {
        // If parameter can't be retrieved, default to false
        enableTemplate = false;
      }

      let contextTemplate = '';
      let templateOptions: IDataObject = {};
      let historyCount = 5;
      let shortTermCount = 10;

      // Only get template parameters if template is enabled (they're only visible when enabled)
      if (enableTemplate) {
        try {
          contextTemplate = this.getNodeParameter('memoryContextTemplate', itemIndex, '') as string;
        } catch (error) {
          throw new NodeOperationError(
            this.getNode(),
            `Failed to get 'memoryContextTemplate' parameter: ${(error as Error).message}. This parameter is only available when 'Enable Context Template' is turned on. Please turn on 'Enable Context Template' or turn it off if you don't need template formatting.`,
            { itemIndex },
          );
        }
        try {
          templateOptions = this.getNodeParameter(
            'memoryTemplateOptions',
            itemIndex,
            {},
          ) as IDataObject;
        } catch (error) {
          // Template options are optional, use defaults if unavailable
          templateOptions = {};
        }
        historyCount = (templateOptions.historyCount as number) || 5;
        shortTermCount = (templateOptions.shortTermCount as number) || 10;
      }

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
          { itemIndex },
        );
      }

      // Start trace for AI Agent memory initialization
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

      // Pass both tracers - cloud tracer for parent/child spans, legacy for compatibility
      const legacyTracer: MemoryTracer | undefined = undefined;
      let exportToJaeger = false;
      let jaegerEndpoint = 'http://jaeger:4318/v1/traces';

      try {
        exportToJaeger = this.getNodeParameter('exportToJaeger', itemIndex, false) as boolean;
      } catch (error) {
        // Default to false if parameter can't be retrieved
        exportToJaeger = false;
      }

      try {
        jaegerEndpoint = this.getNodeParameter(
          'jaegerOtlpEndpoint',
          itemIndex,
          'http://jaeger:4318/v1/traces',
        ) as string;
      } catch (error) {
        // Default to standard Jaeger endpoint if parameter can't be retrieved
        jaegerEndpoint = 'http://jaeger:4318/v1/traces';
      }

      // T012: Create MemMachineMemory instance with v2 API configuration
      const memory = new MemMachineMemory({
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

      // Note: Don't complete parent span here - it stays open for the lifecycle of the memory instance
      // Child spans (loadMemoryVariables, saveContext) will be linked to this parent
      console.log('[MemMachine] supplyData - Parent span started', {
        traceId,
        sessionId: sessionId.trim(),
        tracingEnabled,
      });

      // Return memory instance wrapped in SupplyData format
      console.log('[MemMachine] supplyData - Returning memory instance', {
        sessionId: sessionId.trim(),
        memoryType: memory.constructor.name,
      });

      // Build response with traces if enabled
      // Note: Don't export traces here - they will be exported by child operations
      const response: SupplyData = {
        response: memory,
      };

      return response;
    } catch (error) {
      // Complete trace on error
      if (tracingEnabled && traceId) {
        cloudTracer.completeOperation(traceId, {
          success: false,
          error: (error as Error).message,
          metadata: {
            mode: 'ai_agent_memory',
            errorType: error instanceof NodeOperationError ? 'NodeOperationError' : 'Error',
            sessionId: sessionId ? sessionId.trim() : 'unknown',
          },
        });
      }

      throw new NodeOperationError(
        this.getNode(),
        `Failed to initialize MemMachine memory: ${(error as Error).message}`,
        {
          itemIndex,
        },
      );
    }
  }
}
