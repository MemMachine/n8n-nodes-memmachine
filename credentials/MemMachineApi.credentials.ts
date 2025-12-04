import type {
  IAuthenticateGeneric,
  ICredentialTestRequest,
  ICredentialType,
  INodeProperties,
} from 'n8n-workflow';

export class MemMachineApi implements ICredentialType {
  name = 'memMachineApi';
  displayName = 'MemMachine API';
  documentationUrl = 'https://docs.memmachine.ai';
  properties: INodeProperties[] = [
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

  authenticate: IAuthenticateGeneric = {
    type: 'generic',
    properties: {
      headers: {
        Authorization: '={{ $credentials.apiKey ? "Bearer " + $credentials.apiKey : undefined }}',
      },
    },
  };

  test: ICredentialTestRequest = {
    request: {
      baseURL: '={{$credentials.apiEndpoint}}',
      url: '/api/v2/health',
      method: 'GET',
    },
  };
}
