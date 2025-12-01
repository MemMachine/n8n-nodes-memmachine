"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemMachineApi = void 0;
class MemMachineApi {
    name = 'memMachineApi';
    displayName = 'MemMachine API';
    documentationUrl = 'https://docs.memmachine.ai';
    properties = [
        {
            displayName: 'API Endpoint',
            name: 'apiEndpoint',
            type: 'string',
            default: 'http://localhost:8080',
            placeholder: 'http://localhost:8080',
            description: 'Base URL for MemMachine API (e.g., http://localhost:8080 or your production endpoint)',
            required: true,
        },
        {
            displayName: 'API Key',
            name: 'apiKey',
            type: 'string',
            typeOptions: {
                password: true,
            },
            default: '',
            description: 'Optional API key for authenticated deployments (leave empty for local development)',
            required: false,
        },
    ];
    authenticate = {
        type: 'generic',
        properties: {
            headers: {
                Authorization: '={{ $credentials.apiKey ? "Bearer " + $credentials.apiKey : undefined }}',
            },
        },
    };
    test = {
        request: {
            baseURL: '={{$credentials.apiEndpoint}}',
            url: '/api/v2/health',
            method: 'GET',
        },
    };
}
exports.MemMachineApi = MemMachineApi;
//# sourceMappingURL=MemMachineApi.credentials.js.map