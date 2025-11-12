"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemMachineMemory = void 0;
const categorizeMemories_1 = require("./utils/categorizeMemories");
const renderTemplate_1 = require("./utils/renderTemplate");
class MemMachineMemory {
    config;
    returnMessages = true;
    inputKey = 'input';
    outputKey = 'output';
    constructor(config) {
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
        try {
            console.log('[MemMachineMemory] loadMemoryVariables - CALLED - Retrieving conversation history', {
                sessionId: this.config.sessionId,
                contextWindowLength: this.config.contextWindowLength,
            });
            this.config.logger?.info('loadMemoryVariables - Retrieving conversation history', {
                sessionId: this.config.sessionId,
                contextWindowLength: this.config.contextWindowLength,
            });
            const searchBody = {
                session: {
                    group_id: this.config.groupId,
                    agent_id: this.config.agentId,
                    user_id: this.config.userId,
                    session_id: this.config.sessionId,
                },
                query: '',
                limit: this.config.contextWindowLength,
                filter: {
                    session_id: this.config.sessionId,
                    category: 'history',
                },
            };
            const headers = {
                'Content-Type': 'application/json',
                'session-id': this.config.sessionId,
                ...(this.config.apiKey && { Authorization: `Bearer ${this.config.apiKey}` }),
            };
            const searchSpan = this.config.tracer?.startSpan('memmachine.search', {
                attributes: {
                    'http.method': 'POST',
                    'http.url': `${this.config.apiUrl}/v1/memories/search`,
                    'memmachine.session.id': this.config.sessionId,
                    'memmachine.session.group_id': this.config.groupId,
                    'memmachine.query.limit': this.config.contextWindowLength || 10,
                },
            });
            const sanitizedHeaders = { ...headers };
            if (sanitizedHeaders.Authorization) {
                sanitizedHeaders.Authorization = sanitizedHeaders.Authorization.substring(0, 15) + '***';
            }
            searchSpan && this.config.tracer?.addEvent(searchSpan, 'memmachine.search.headers', sanitizedHeaders);
            searchSpan && this.config.tracer?.addEvent(searchSpan, 'memmachine.search.payload', {
                'payload.session': JSON.stringify(searchBody.session),
                'payload.query': searchBody.query,
                'payload.limit': searchBody.limit || 10,
                'payload.filter': JSON.stringify(searchBody.filter),
            });
            if (searchSpan && this.config.tracer) {
                const headerLogKV = {};
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
            const response = await fetch(`${this.config.apiUrl}/v1/memories/search`, {
                method: 'POST',
                headers,
                body: JSON.stringify(searchBody),
            });
            searchSpan && this.config.tracer?.addAttributes(searchSpan, {
                'http.status_code': response.status,
                'http.status_text': response.statusText,
            });
            if (!response.ok) {
                const error = new Error(`MemMachine API error: ${response.status} ${response.statusText}`);
                searchSpan && this.config.tracer?.endSpanWithError(searchSpan, error);
                throw error;
            }
            const data = await response.json();
            const responseBody = JSON.stringify(data);
            if (searchSpan && this.config.tracer) {
                const responseHeaderLogKV = {};
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
            const content = data.content || {};
            const rawEpisodicMemory = content.episodic_memory || [];
            const rawProfileMemory = content.profile_memory || [];
            searchSpan && this.config.tracer?.addAttributes(searchSpan, {
                'memmachine.response.episodic_count': Array.isArray(rawEpisodicMemory) ? rawEpisodicMemory.length : 0,
                'memmachine.response.profile_count': Array.isArray(rawProfileMemory) ? rawProfileMemory.length : 0,
            });
            if (this.config.enableTemplate && this.config.contextTemplate) {
                return this.formatTemplatedMemory(rawEpisodicMemory, rawProfileMemory);
            }
            const messages = [];
            if (Array.isArray(rawEpisodicMemory)) {
                for (const group of rawEpisodicMemory) {
                    if (Array.isArray(group)) {
                        for (const item of group) {
                            if (item && item.content && item.content.trim() !== '') {
                                const isUserMessage = this.config.userId.includes(item.producer_id);
                                if (isUserMessage) {
                                    messages.push({
                                        type: 'human',
                                        content: item.content,
                                        additional_kwargs: {},
                                    });
                                }
                                else {
                                    messages.push({
                                        type: 'ai',
                                        content: item.content,
                                        additional_kwargs: {},
                                    });
                                }
                            }
                        }
                    }
                }
            }
            const recentMessages = messages.slice(-this.config.contextWindowLength);
            this.config.logger?.info('loadMemoryVariables - Retrieved messages', {
                totalMessages: messages.length,
                recentMessages: recentMessages.length,
            });
            searchSpan && this.config.tracer?.addAttributes(searchSpan, {
                'memmachine.messages.total': messages.length,
                'memmachine.messages.returned': recentMessages.length,
            });
            searchSpan && this.config.tracer?.endSpan(searchSpan);
            return {
                chat_history: recentMessages,
            };
        }
        catch (error) {
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
        try {
            const userMessage = inputValues.input;
            const agentResponse = outputValues.output;
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
            if (userMessage) {
                await this.storeMessage(userMessage, this.config.userId[0], this.config.agentId[0]);
            }
            if (agentResponse) {
                await this.storeMessage(agentResponse, this.config.agentId[0], this.config.userId[0]);
            }
            this.config.logger?.info('saveContext - Successfully stored conversation turn');
        }
        catch (error) {
            this.config.logger?.error('saveContext - Failed to store conversation', {
                error: error.message,
                sessionId: this.config.sessionId,
            });
        }
    }
    async storeMessage(content, producer, producedFor) {
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
                category: 'history',
                timestamp: new Date().toISOString(),
            },
        };
        const headers = {
            'Content-Type': 'application/json',
            'session-id': this.config.sessionId,
            ...(this.config.apiKey && { Authorization: `Bearer ${this.config.apiKey}` }),
        };
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
        const sanitizedHeaders = { ...headers };
        if (sanitizedHeaders.Authorization) {
            sanitizedHeaders.Authorization = sanitizedHeaders.Authorization.substring(0, 15) + '***';
        }
        storeSpan && this.config.tracer?.addEvent(storeSpan, 'memmachine.store.headers', sanitizedHeaders);
        storeSpan && this.config.tracer?.addEvent(storeSpan, 'memmachine.store.payload', {
            'payload.session': JSON.stringify(storeBody.session),
            'payload.producer': producer,
            'payload.produced_for': producedFor,
            'payload.episode_content': content.length > 200 ? content.substring(0, 200) + '...' : content,
            'payload.episode_type': storeBody.episode_type,
            'payload.metadata': JSON.stringify(storeBody.metadata),
        });
        if (storeSpan && this.config.tracer) {
            const headerLogKV = {};
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
        storeSpan && this.config.tracer?.addAttributes(storeSpan, {
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
                'body': responseText || '(empty)',
                'body.size': responseText.length,
            });
        }
        if (!response.ok) {
            const error = new Error(`MemMachine Store API error: ${response.status} ${response.statusText}`);
            storeSpan && this.config.tracer?.endSpanWithError(storeSpan, error);
            throw error;
        }
        storeSpan && this.config.tracer?.endSpan(storeSpan);
    }
    formatTemplatedMemory(rawEpisodicMemory, rawProfileMemory) {
        console.log('[MemMachineMemory] Formatting templated memory', {
            episodicCount: rawEpisodicMemory.length,
            profileCount: rawProfileMemory.length,
        });
        const flattenedMemories = [];
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
        const profileMemoryFacts = [];
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
        const profileMemory = {
            facts: profileMemoryFacts,
            entities: {},
        };
        const historyCount = this.config.historyCount || 5;
        const shortTermCount = this.config.shortTermCount || 10;
        const categorized = (0, categorizeMemories_1.categorizeMemories)(flattenedMemories, historyCount, shortTermCount);
        const contextText = (0, renderTemplate_1.renderTemplate)(this.config.contextTemplate, categorized, profileMemory);
        console.log('[MemMachineMemory] Templated context length:', contextText.length);
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