"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemMachineMemory = void 0;
const categorizeMemories_1 = require("../utils/categorizeMemories");
const renderTemplate_1 = require("../utils/renderTemplate");
class MemMachineMemory {
    config;
    returnMessages = true;
    inputKey = 'input';
    outputKey = 'output';
    constructor(config) {
        if (!config.orgId || config.orgId.trim() === '') {
            throw new Error('MemMachine API v2 requires organization ID (orgId)');
        }
        if (!config.projectId || config.projectId.trim() === '') {
            throw new Error('MemMachine API v2 requires project ID (projectId)');
        }
        this.config = {
            ...config,
            contextWindowLength: config.contextWindowLength || 10,
        };
        if (!this.config.sessionId) {
            throw new Error('MemMachineMemory requires a sessionId for conversation isolation');
        }
    }
    get memoryKeys() {
        return ['chat_history'];
    }
    async loadMemoryVariables(_values) {
        let loadTraceId = '';
        if (this.config.cloudTracer && this.config.parentTraceId) {
            loadTraceId = this.config.cloudTracer.startOperation('memory', 'retrieve', {
                operation: 'loadMemoryVariables',
                sessionId: this.config.sessionId,
                contextWindowLength: this.config.contextWindowLength,
            }, this.config.parentTraceId);
        }
        try {
            const query = _values[this.inputKey] || _values.input || '';
            this.config.logger?.info('loadMemoryVariables - Retrieving conversation history', {
                sessionId: this.config.sessionId,
                contextWindowLength: this.config.contextWindowLength,
            });
            const searchBody = {
                org_id: this.config.orgId,
                project_id: this.config.projectId,
                query: query,
                top_k: this.config.contextWindowLength,
                types: [],
            };
            this.config.logger?.info('[MemMachineMemory] DEBUG - Search Body', searchBody);
            const headers = {
                'Content-Type': 'application/json',
                ...(this.config.apiKey && { Authorization: `Bearer ${this.config.apiKey}` }),
            };
            const searchSpan = this.config.tracer?.startSpan('memmachine.search', {
                attributes: {
                    'http.method': 'POST',
                    'http.url': `${this.config.apiUrl}/memories/search`,
                    'memmachine.session.id': this.config.sessionId,
                    'memmachine.session.group_id': this.config.groupId,
                    'memmachine.query.top_k': this.config.contextWindowLength || 10,
                    'memmachine.query.types': JSON.stringify(['episodic']),
                },
            });
            const sanitizedHeaders = { ...headers };
            if (sanitizedHeaders.Authorization) {
                sanitizedHeaders.Authorization = sanitizedHeaders.Authorization.substring(0, 15) + '***';
            }
            void (searchSpan &&
                this.config.tracer?.addEvent(searchSpan, 'memmachine.search.headers', sanitizedHeaders));
            void (searchSpan &&
                this.config.tracer?.addEvent(searchSpan, 'memmachine.search.payload', {
                    'payload.org_id': searchBody.org_id,
                    'payload.project_id': searchBody.project_id,
                    'payload.query': searchBody.query,
                    'payload.top_k': searchBody.top_k || 10,
                    'payload.types': JSON.stringify(searchBody.types),
                }));
            if (searchSpan && this.config.tracer) {
                const headerLogKV = {};
                for (const [key, value] of Object.entries(sanitizedHeaders)) {
                    headerLogKV[`header.${key}`] = String(value);
                }
                this.config.tracer.addEvent(searchSpan, 'request.send', {
                    'http.method': 'POST',
                    'http.url': `${this.config.apiUrl}/memories/search`,
                    'http.target': '/memories/search',
                    ...headerLogKV,
                    body: JSON.stringify(searchBody),
                });
            }
            let apiCallTraceId = '';
            const requestBodyFormatted = JSON.stringify(searchBody, null, 2);
            const requestBody = JSON.stringify(searchBody);
            if (this.config.cloudTracer && loadTraceId) {
                apiCallTraceId = this.config.cloudTracer.startOperation('memory', 'search', {
                    operation: 'api_call_search',
                    endpoint: '/memories/search',
                    sessionId: this.config.sessionId,
                    'request.body': requestBodyFormatted,
                    'request.body.size': requestBody.length,
                }, loadTraceId);
            }
            const response = await fetch(`${this.config.apiUrl}/memories/search`, {
                method: 'POST',
                headers,
                body: requestBody,
            });
            const responseText = await response.text();
            let data = {};
            try {
                data = JSON.parse(responseText);
            }
            catch (e) {
            }
            const apiResponseBody = JSON.stringify(data, null, 2);
            if (apiCallTraceId && this.config.cloudTracer) {
                this.config.cloudTracer.completeOperation(apiCallTraceId, {
                    success: response.ok,
                    metadata: {
                        'http.status_code': response.status,
                        'http.status_text': response.statusText,
                        'response.body': apiResponseBody.length > 1000
                            ? apiResponseBody.substring(0, 1000) + '...[truncated]'
                            : apiResponseBody,
                        'response.body.size': apiResponseBody.length,
                    },
                });
            }
            searchSpan &&
                this.config.tracer?.addAttributes(searchSpan, {
                    'http.status_code': response.status,
                    'http.status_text': response.statusText,
                });
            if (response.ok) {
                this.config.logger?.info('[MemMachineMemory] DEBUG - Search API Success Response:', apiResponseBody);
            }
            if (!response.ok) {
                this.config.logger?.error('[MemMachineMemory] DEBUG - Search API Error:', {
                    status: response.status,
                    statusText: response.statusText,
                    body: responseText,
                });
                const error = new Error(`MemMachine API error: ${response.status} ${response.statusText} - ${responseText}`);
                searchSpan && this.config.tracer?.endSpanWithError(searchSpan, error);
                throw error;
            }
            const responseBody = apiResponseBody;
            if (searchSpan && this.config.tracer) {
                const responseHeaderLogKV = {};
                response.headers.forEach((value, key) => {
                    responseHeaderLogKV[`header.${key}`] = value;
                });
                this.config.tracer.addEvent(searchSpan, 'response.received', {
                    'http.status_code': response.status,
                    'http.status_text': response.statusText,
                    ...responseHeaderLogKV,
                    body: responseBody.length > 5000
                        ? responseBody.substring(0, 5000) + '...[truncated]'
                        : responseBody,
                    'body.size': responseBody.length,
                });
            }
            let rawMemories = [];
            let rawEpisodicMemory = [];
            let rawProfileMemory = [];
            let rawSemanticMemory = [];
            let episodeSummary = [];
            if (data.memories && Array.isArray(data.memories)) {
                rawMemories = data.memories;
                rawEpisodicMemory = rawMemories.filter((m) => m.type === 'episodic');
                rawProfileMemory = rawMemories.filter((m) => m.type === 'profile');
            }
            else if (data.content && typeof data.content === 'object') {
                const content = data.content;
                if (content.episodic_memory) {
                    const episodicMem = content.episodic_memory;
                    if (episodicMem.short_term_memory?.episodes) {
                        rawEpisodicMemory.push(...episodicMem.short_term_memory.episodes);
                    }
                    if (episodicMem.short_term_memory?.episode_summary &&
                        Array.isArray(episodicMem.short_term_memory.episode_summary)) {
                        episodeSummary = episodicMem.short_term_memory.episode_summary.filter((s) => s && s.trim() !== '');
                    }
                    if (episodicMem.long_term_memory?.episodes) {
                        rawEpisodicMemory.push(...episodicMem.long_term_memory.episodes);
                    }
                }
                if (content.semantic_memory && Array.isArray(content.semantic_memory)) {
                    rawSemanticMemory = content.semantic_memory;
                    rawProfileMemory = content.semantic_memory;
                }
                rawMemories = [...rawEpisodicMemory, ...rawSemanticMemory];
            }
            this.config.logger?.info(`[MemMachineMemory] DEBUG - Extracted Memories: Total=${rawMemories.length}, Episodic=${rawEpisodicMemory.length}, Semantic=${rawSemanticMemory.length}`);
            searchSpan &&
                this.config.tracer?.addAttributes(searchSpan, {
                    'memmachine.response.total_count': rawMemories.length,
                    'memmachine.response.episodic_count': rawEpisodicMemory.length,
                    'memmachine.response.semantic_count': rawSemanticMemory.length,
                    'memmachine.response.profile_count': rawProfileMemory.length,
                });
            let processingTraceId = '';
            if (this.config.cloudTracer && loadTraceId) {
                processingTraceId = this.config.cloudTracer.startOperation('memory', 'enrich', {
                    operation: 'process_memories',
                    episodicCount: Array.isArray(rawEpisodicMemory) ? rawEpisodicMemory.length : 0,
                    profileCount: Array.isArray(rawProfileMemory) ? rawProfileMemory.length : 0,
                    templateEnabled: this.config.enableTemplate,
                }, loadTraceId);
            }
            if (this.config.enableTemplate && this.config.contextTemplate) {
                const result = this.formatTemplatedMemory(rawEpisodicMemory, rawProfileMemory, rawSemanticMemory, episodeSummary);
                const renderedContent = result.chat_history?.[0]?.content || '';
                if (processingTraceId && this.config.cloudTracer) {
                    this.config.cloudTracer.completeOperation(processingTraceId, {
                        success: true,
                        metadata: {
                            operation: 'format_template',
                            outputLength: renderedContent.length,
                            renderedContext: renderedContent.length > 2000
                                ? renderedContent.substring(0, 2000) + '\n\n...[truncated]'
                                : renderedContent,
                        },
                    });
                }
                return result;
            }
            const messages = [];
            if (Array.isArray(rawEpisodicMemory)) {
                for (const memory of rawEpisodicMemory) {
                    if (memory &&
                        memory.content &&
                        typeof memory.content === 'string' &&
                        memory.content.trim() !== '') {
                        const content = memory.content;
                        const producer = memory.producer_id || memory.producer || '';
                        const isUserMessage = this.config.userId.some((uid) => producer && producer.includes(uid)) ||
                            memory.producer_role === 'user';
                        if (isUserMessage) {
                            messages.push({
                                type: 'human',
                                content: content,
                                additional_kwargs: {},
                            });
                        }
                        else {
                            messages.push({
                                type: 'ai',
                                content: content,
                                additional_kwargs: {},
                            });
                        }
                    }
                    else if (memory && Array.isArray(memory.messages) && memory.messages.length > 0) {
                        const message = memory.messages[0];
                        if (message.content && message.content.trim() !== '') {
                            const isUserMessage = this.config.userId.some((uid) => message.producer && message.producer.includes(uid));
                            if (isUserMessage) {
                                messages.push({
                                    type: 'human',
                                    content: message.content,
                                    additional_kwargs: {},
                                });
                            }
                            else {
                                messages.push({
                                    type: 'ai',
                                    content: message.content,
                                    additional_kwargs: {},
                                });
                            }
                        }
                    }
                }
            }
            const recentMessages = messages.slice(-this.config.contextWindowLength);
            this.config.logger?.info(`[MemMachineMemory] DEBUG - Final Messages: Total=${messages.length}, Returned=${recentMessages.length}`);
            this.config.logger?.info('loadMemoryVariables - Retrieved messages', {
                totalMessages: messages.length,
                recentMessages: recentMessages.length,
            });
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
            searchSpan &&
                this.config.tracer?.addAttributes(searchSpan, {
                    'memmachine.messages.total': messages.length,
                    'memmachine.messages.returned': recentMessages.length,
                });
            searchSpan && this.config.tracer?.endSpan(searchSpan);
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
                if (this.config.exportToJaeger && this.config.jaegerEndpoint) {
                    this.config.cloudTracer
                        .exportTracesToJaeger(this.config.jaegerEndpoint)
                        .catch((error) => {
                        console.error('[MemMachineMemory] Failed to export traces after loadMemoryVariables:', error);
                    });
                }
            }
            return {
                chat_history: recentMessages,
            };
        }
        catch (error) {
            if (loadTraceId && this.config.cloudTracer) {
                this.config.cloudTracer.completeOperation(loadTraceId, {
                    success: false,
                    error: error.message,
                    metadata: {
                        operation: 'loadMemoryVariables',
                        sessionId: this.config.sessionId,
                    },
                });
                if (this.config.exportToJaeger && this.config.jaegerEndpoint) {
                    this.config.cloudTracer
                        .exportTracesToJaeger(this.config.jaegerEndpoint)
                        .catch((exportError) => {
                        console.error('[MemMachineMemory] Failed to export traces after loadMemoryVariables error:', exportError);
                    });
                }
            }
            this.config.logger?.error('loadMemoryVariables - Failed to retrieve history', {
                error: error.message,
                sessionId: this.config.sessionId,
            });
            return {
                chat_history: [],
            };
        }
    }
    async saveContext(inputValues, outputValues) {
        let saveTraceId = '';
        if (this.config.cloudTracer && this.config.parentTraceId) {
            saveTraceId = this.config.cloudTracer.startOperation('memory', 'store', {
                operation: 'saveContext',
                sessionId: this.config.sessionId,
            }, this.config.parentTraceId);
        }
        try {
            const userMessage = inputValues.input;
            const agentResponse = outputValues.output;
            this.config.logger?.info('saveContext - Storing conversation turn', {
                sessionId: this.config.sessionId,
                userMessageLength: userMessage?.length || 0,
                agentResponseLength: agentResponse?.length || 0,
            });
            if (userMessage) {
                await this.storeMessage(userMessage, this.config.userId[0] ?? '', this.config.agentId[0] ?? '', saveTraceId, 'user_message');
            }
            if (agentResponse) {
                await this.storeMessage(agentResponse, this.config.agentId[0] ?? '', this.config.userId[0] ?? '', saveTraceId, 'agent_response');
            }
            this.config.logger?.info('saveContext - Successfully stored conversation turn');
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
                if (this.config.exportToJaeger && this.config.jaegerEndpoint) {
                    this.config.cloudTracer
                        .exportTracesToJaeger(this.config.jaegerEndpoint)
                        .catch((error) => {
                        console.error('[MemMachineMemory] Failed to export traces after saveContext:', error);
                    });
                }
            }
        }
        catch (error) {
            if (saveTraceId && this.config.cloudTracer) {
                this.config.cloudTracer.completeOperation(saveTraceId, {
                    success: false,
                    error: error.message,
                    metadata: {
                        operation: 'saveContext',
                        sessionId: this.config.sessionId,
                    },
                });
                if (this.config.exportToJaeger && this.config.jaegerEndpoint) {
                    this.config.cloudTracer
                        .exportTracesToJaeger(this.config.jaegerEndpoint)
                        .catch((exportError) => {
                        console.error('[MemMachineMemory] Failed to export traces after saveContext error:', exportError);
                    });
                }
            }
            this.config.logger?.error('saveContext - Failed to store conversation', {
                error: error.message,
                sessionId: this.config.sessionId,
            });
        }
    }
    async storeMessage(content, producer, producedFor, parentTraceId = '', messageType = 'message') {
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
                        session_id: this.config.sessionId,
                        category: 'history',
                        timestamp: new Date().toISOString(),
                    },
                },
            ],
        };
        this.config.logger?.info('[MemMachineMemory] DEBUG - Store Body', storeBody);
        const headers = {
            'Content-Type': 'application/json',
            ...(this.config.apiKey && { Authorization: `Bearer ${this.config.apiKey}` }),
        };
        const storeSpan = this.config.tracer?.startSpan('memmachine.store', {
            attributes: {
                'http.method': 'POST',
                'http.url': `${this.config.apiUrl}/memories`,
                'memmachine.session.id': this.config.sessionId,
                'memmachine.org_id': this.config.orgId,
                'memmachine.project_id': this.config.projectId,
                'memmachine.message.producer': producer,
                'memmachine.message.produced_for': producedFor,
                'memmachine.message.length': content.length,
            },
        });
        const sanitizedHeaders = { ...headers };
        if (sanitizedHeaders.Authorization) {
            sanitizedHeaders.Authorization = sanitizedHeaders.Authorization.substring(0, 15) + '***';
        }
        storeSpan &&
            this.config.tracer?.addEvent(storeSpan, 'memmachine.store.headers', sanitizedHeaders);
        storeSpan &&
            this.config.tracer?.addEvent(storeSpan, 'memmachine.store.payload', {
                'payload.org_id': this.config.orgId,
                'payload.project_id': this.config.projectId,
                'payload.messages[0].producer': producer,
                'payload.messages[0].produced_for': producedFor,
                'payload.messages[0].content': content.length > 200 ? content.substring(0, 200) + '...' : content,
                'payload.messages[0].role': storeBody.messages[0]?.role,
                'payload.messages[0].metadata': JSON.stringify(storeBody.messages[0]?.metadata),
            });
        if (storeSpan && this.config.tracer) {
            const headerLogKV = {};
            for (const [key, value] of Object.entries(sanitizedHeaders)) {
                headerLogKV[`header.${key}`] = String(value);
            }
            this.config.tracer.addEvent(storeSpan, 'request.send', {
                'http.method': 'POST',
                'http.url': `${this.config.apiUrl}/memories`,
                'http.target': '/memories',
                ...headerLogKV,
                body: JSON.stringify(storeBody),
            });
        }
        let apiStoreTraceId = '';
        const storeRequestBodyFormatted = JSON.stringify(storeBody, null, 2);
        const storeRequestBody = JSON.stringify(storeBody);
        if (this.config.cloudTracer && parentTraceId) {
            apiStoreTraceId = this.config.cloudTracer.startOperation('memory', 'store', {
                operation: `api_call_store_${messageType}`,
                endpoint: '/memories',
                producer,
                messageLength: content.length,
                'request.body': storeRequestBodyFormatted.length > 500
                    ? storeRequestBodyFormatted.substring(0, 500) + '...[truncated]'
                    : storeRequestBodyFormatted,
                'request.body.size': storeRequestBody.length,
            }, parentTraceId);
        }
        let response = await fetch(`${this.config.apiUrl}/memories`, {
            method: 'POST',
            headers,
            body: storeRequestBody,
        });
        if (!response.ok && response.status === 404) {
            const errorText = await response.clone().text();
            if (errorText.toLowerCase().includes('project')) {
                const createProjectResponse = await fetch(`${this.config.apiUrl}/projects`, {
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
                if (createProjectResponse.ok || createProjectResponse.status === 409) {
                    response = await fetch(`${this.config.apiUrl}/memories`, {
                        method: 'POST',
                        headers,
                        body: storeRequestBody,
                    });
                }
                else {
                    const createErrorText = await createProjectResponse.text();
                    throw new Error(`Failed to auto-create project: ${createProjectResponse.status} ${createErrorText}`);
                }
            }
        }
        const responseText = await response.clone().text();
        let formattedResponse = responseText;
        try {
            const parsed = JSON.parse(responseText);
            formattedResponse = JSON.stringify(parsed, null, 2);
        }
        catch (e) {
        }
        if (apiStoreTraceId && this.config.cloudTracer) {
            this.config.cloudTracer.completeOperation(apiStoreTraceId, {
                success: response.ok,
                metadata: {
                    'http.status_code': response.status,
                    'http.status_text': response.statusText,
                    messageType,
                    'response.body': formattedResponse.length > 500
                        ? formattedResponse.substring(0, 500) + '...[truncated]'
                        : formattedResponse,
                    'response.body.size': responseText.length,
                },
            });
        }
        storeSpan &&
            this.config.tracer?.addAttributes(storeSpan, {
                'http.status_code': response.status,
                'http.status_text': response.statusText,
            });
        if (storeSpan && this.config.tracer) {
            const responseHeaderLogKV = {};
            response.headers.forEach((value, key) => {
                responseHeaderLogKV[`header.${key}`] = value;
            });
            this.config.tracer.addEvent(storeSpan, 'response.received', {
                'http.status_code': response.status,
                'http.status_text': response.statusText,
                ...responseHeaderLogKV,
                body: responseText || '(empty)',
                'body.size': responseText.length,
            });
        }
        if (!response.ok) {
            console.error('[MemMachineMemory] DEBUG - Store API Error:', {
                status: response.status,
                statusText: response.statusText,
                body: responseText,
            });
            const error = new Error(`MemMachine Store API error: ${response.status} ${response.statusText} - ${responseText}`);
            storeSpan && this.config.tracer?.endSpanWithError(storeSpan, error);
            throw error;
        }
        storeSpan && this.config.tracer?.endSpan(storeSpan);
    }
    formatTemplatedMemory(rawEpisodicMemory, rawProfileMemory, rawSemanticMemory, episodeSummary) {
        this.config.logger?.info('[MemMachineMemory] Formatting templated memory', {
            episodicCount: rawEpisodicMemory.length,
            profileCount: rawProfileMemory.length,
            semanticCount: rawSemanticMemory.length,
            summaryCount: episodeSummary.length,
        });
        const flattenedMemories = [];
        const seenEpisodes = new Set();
        this.config.logger?.info('[MemMachineMemory] DEBUG - Processing episodic memories. Raw count:', rawEpisodicMemory.length);
        if (Array.isArray(rawEpisodicMemory)) {
            for (const group of rawEpisodicMemory) {
                const items = Array.isArray(group) ? group : [group];
                if (Array.isArray(group)) {
                    this.config.logger?.info('[MemMachineMemory] DEBUG - Processing memory group size:', group.length);
                }
                for (const item of items) {
                    if (item && typeof item === 'object' && item.content && item.content.trim() !== '') {
                        const content = item.content;
                        const producer = item.producer_id || 'unknown';
                        const producedFor = item.produced_for_id || 'unknown';
                        const episodeKey = `${content}|${producer}|${producedFor}`;
                        if (!seenEpisodes.has(episodeKey)) {
                            seenEpisodes.add(episodeKey);
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
                        }
                        else {
                            this.config.logger?.info('[MemMachineMemory] DEBUG - Duplicate episode skipped:', episodeKey.substring(0, 50) + '...');
                        }
                    }
                    else {
                        this.config.logger?.info('[MemMachineMemory] DEBUG - Invalid or empty episode item encountered:', JSON.stringify(item).substring(0, 100));
                    }
                }
            }
        }
        this.config.logger?.info('[MemMachineMemory] DEBUG - Final flattened memories count:', flattenedMemories.length);
        const profileMemoryFacts = [];
        const deduplicatedSemanticMemory = [];
        const seenFacts = new Set();
        if (Array.isArray(rawProfileMemory)) {
            for (const item of rawProfileMemory) {
                if (item && typeof item === 'object') {
                    const tag = item.tag || 'General';
                    const feature = item.feature || 'property';
                    const value = item.value || '';
                    const factKey = `${tag}|${feature}|${value}`;
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
        const profileMemory = {
            facts: profileMemoryFacts,
            entities: {},
        };
        this.config.logger?.info('[MemMachineMemory] DEBUG - Profile/Semantic Memory Processing:', {
            rawProfileCount: Array.isArray(rawProfileMemory) ? rawProfileMemory.length : 0,
            dedupedProfileCount: profileMemoryFacts.length,
            dedupedSemanticCount: deduplicatedSemanticMemory.length,
        });
        const historyCount = this.config.historyCount !== undefined ? this.config.historyCount : 5;
        const shortTermCount = this.config.shortTermCount !== undefined ? this.config.shortTermCount : 10;
        const categorized = (0, categorizeMemories_1.categorizeMemories)(flattenedMemories, historyCount, shortTermCount);
        this.config.logger?.info('[MemMachineMemory] DEBUG - Memory Categorization:', {
            totalFlattened: flattenedMemories.length,
            historyCountConfig: historyCount,
            shortTermCountConfig: shortTermCount,
            historyActual: categorized.history.length,
            shortTermActual: categorized.shortTermMemory.length,
            longTermActual: categorized.longTermMemory.length,
        });
        const contextText = (0, renderTemplate_1.renderTemplate)(this.config.contextTemplate, categorized, profileMemory, deduplicatedSemanticMemory, episodeSummary);
        this.config.logger?.info('[MemMachineMemory] Templated context length:', contextText.length);
        this.config.logger?.info('[MemMachineMemory] Rendered context preview:', contextText.substring(0, 500));
        return {
            chat_history: [
                {
                    type: 'system',
                    content: contextText,
                    additional_kwargs: {},
                },
            ],
        };
    }
}
exports.MemMachineMemory = MemMachineMemory;
//# sourceMappingURL=MemMachineMemory.js.map