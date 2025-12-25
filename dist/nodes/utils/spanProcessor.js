"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SensitiveDataSpanProcessor = exports.MAX_ATTRIBUTE_VALUE_LENGTH = exports.SAFE_SPAN_ATTRIBUTES = void 0;
exports.SAFE_SPAN_ATTRIBUTES = new Set([
    'operation.type',
    'operation.mode',
    'session.id',
    'user.id',
    'agent.id',
    'group.id',
    'memory.count',
    'memory.count.raw',
    'memory.count.history',
    'memory.count.short',
    'memory.count.long',
    'memory.count.profile',
    'template.enabled',
    'template.length',
    'http.method',
    'http.url',
    'http.target',
    'http.status_code',
    'http.status_text',
    'error',
    'error.type',
    'message.length',
    'memmachine.session.id',
    'memmachine.session.group_id',
    'memmachine.query.limit',
    'memmachine.response.episodic_count',
    'memmachine.response.profile_count',
    'memmachine.messages.total',
    'memmachine.messages.returned',
    'memmachine.message.producer',
    'memmachine.message.produced_for',
    'memmachine.message.length',
    'memmachine.episode.type',
]);
exports.MAX_ATTRIBUTE_VALUE_LENGTH = 256;
class SensitiveDataSpanProcessor {
    onStart(_span, _parentContext) {
    }
    onEnd(_span) {
    }
    async shutdown() {
    }
    async forceFlush() {
    }
    static sanitizeAttribute(key, value) {
        const safePrefixes = ['header.', 'payload.', 'body', 'http.request.', 'http.response.'];
        const hasSafePrefix = safePrefixes.some((prefix) => key.startsWith(prefix));
        if (!exports.SAFE_SPAN_ATTRIBUTES.has(key) && !hasSafePrefix) {
            return undefined;
        }
        const maxLength = key === 'body' ||
            key.startsWith('body.') ||
            key.startsWith('payload.') ||
            key.startsWith('http.request.body') ||
            key.startsWith('http.response.body')
            ? 10000
            : exports.MAX_ATTRIBUTE_VALUE_LENGTH;
        if (typeof value === 'string' && value.length > maxLength) {
            return value.substring(0, maxLength) + '...[truncated]';
        }
        return value;
    }
}
exports.SensitiveDataSpanProcessor = SensitiveDataSpanProcessor;
//# sourceMappingURL=spanProcessor.js.map