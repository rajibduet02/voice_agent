import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'fs';
import os from 'os';
import path from 'path';
import { validateProvisioningEnv } from '../../config/env.validation';
import { VapiHttpClient } from './vapi-http.client';
import { VapiManagementService } from './vapi-management.service';
import {
  ASSISTANT_SYSTEM_PROMPT,
  VAPI_LLM_FUNCTION_NAMES,
  VAPI_STABLE_ASSISTANT_NAME,
  VAPI_STABLE_TOOL_NAMES,
} from './vapi-assistant.config';
import { writeWebEnv } from './web-env.util';

type MockResponse = {
  status: number;
  body: unknown;
};

function createMockFetch(handler: (url: string, init?: RequestInit) => MockResponse) {
  return jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const result = handler(url, init);
    return {
      ok: result.status >= 200 && result.status < 300,
      status: result.status,
      text: async () => JSON.stringify(result.body),
    } as Response;
  }) as unknown as typeof fetch;
}

function withHealthyPublicApi(
  handler: (url: string, init?: RequestInit) => MockResponse,
): (url: string, init?: RequestInit) => MockResponse {
  return (url, init) => {
    if (url.endsWith('/health') && (init?.method ?? 'GET').toUpperCase() === 'GET') {
      return { status: 200, body: { status: 'ok', database: 'up' } };
    }
    return handler(url, init);
  };
}

describe('Vapi provisioning', () => {
  let repoRoot: string;
  const privateKey = 'test-private-key-abc123';
  const publicApiUrl = 'https://tunnel.example.com';

  beforeEach(() => {
    repoRoot = mkdtempSync(path.join(os.tmpdir(), 'voice-agent-vapi-'));
  });

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true });
  });

  it('rejects missing private key and PUBLIC_API_URL', () => {
    expect(() =>
      validateProvisioningEnv({
        NODE_ENV: 'test',
        PUBLIC_API_URL: publicApiUrl,
        VAPI_WEBHOOK_SECRET: 'secret',
      }),
    ).toThrow('VAPI_PRIVATE_KEY is required');

    expect(() =>
      validateProvisioningEnv({
        NODE_ENV: 'test',
        VAPI_PRIVATE_KEY: privateKey,
        VAPI_WEBHOOK_SECRET: 'secret',
      }),
    ).toThrow('PUBLIC_API_URL is required');
  });

  it('rejects a non-HTTPS production PUBLIC_API_URL', () => {
    expect(() =>
      validateProvisioningEnv({
        NODE_ENV: 'production',
        VAPI_PRIVATE_KEY: privateKey,
        PUBLIC_API_URL: 'http://example.com',
        VAPI_WEBHOOK_SECRET: 'secret',
        VAPI_CREDENTIAL_ID: 'cred-1',
        ALLOW_INSECURE_PUBLIC_API_URL: 'true',
      }),
    ).toThrow('HTTPS URL in production');
  });

  it('requires credential ID in production', () => {
    expect(() =>
      validateProvisioningEnv({
        NODE_ENV: 'production',
        VAPI_PRIVATE_KEY: privateKey,
        PUBLIC_API_URL: publicApiUrl,
        VAPI_WEBHOOK_SECRET: 'secret',
      }),
    ).toThrow('VAPI_CREDENTIAL_ID is required for production');
  });

  it('creates resources when none exist and attaches both tools', async () => {
    const state = {
      tools: [] as Array<Record<string, unknown>>,
      assistants: [] as Array<Record<string, unknown>>,
    };

    const fetchImpl = createMockFetch(
      withHealthyPublicApi((url, init) => {
        const method = (init?.method ?? 'GET').toUpperCase();
        const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;

        if (url.endsWith('/tool') && method === 'GET') {
          return { status: 200, body: state.tools };
        }
        if (url.endsWith('/assistant') && method === 'GET') {
          return { status: 200, body: state.assistants };
        }
        if (url.endsWith('/tool') && method === 'POST' && body) {
          const created = { id: `tool-${state.tools.length + 1}`, ...body };
          state.tools.push(created);
          return { status: 201, body: created };
        }
        if (url.endsWith('/assistant') && method === 'POST' && body) {
          const created = { id: 'asst-1', ...body };
          state.assistants.push(created);
          return { status: 201, body: created };
        }
        if (url.endsWith('/assistant/asst-1') && method === 'GET') {
          return { status: 200, body: state.assistants[0] };
        }
        return { status: 404, body: { message: 'not found' } };
      }),
    );

    const env = validateProvisioningEnv({
      NODE_ENV: 'test',
      VAPI_PRIVATE_KEY: privateKey,
      PUBLIC_API_URL: `${publicApiUrl}/`,
      VAPI_WEBHOOK_SECRET: 'secret',
      VAPI_CREDENTIAL_ID: 'cred-1',
      VAPI_ASSISTANT_NAME: VAPI_STABLE_ASSISTANT_NAME,
    });

    const service = VapiManagementService.createStandalone({
      client: new VapiHttpClient({
        apiBaseUrl: 'https://api.vapi.ai',
        privateKey,
        fetchImpl,
      }),
      repoRoot,
      fetchImpl,
      logger: {
        log: () => undefined,
        warn: () => undefined,
        error: () => undefined,
      },
    });

    const result = await service.provision(env);

    expect(result.created.availabilityTool).toBe(true);
    expect(result.created.bookingTool).toBe(true);
    expect(result.created.currentDateTimeTool).toBe(true);
    expect(result.created.resolveDateTool).toBe(true);
    expect(result.created.nextAvailabilityTool).toBe(true);
    expect(result.created.assistant).toBe(true);
    expect(result.toolsUrl).toBe(`${publicApiUrl}/api/v1/vapi/tools`);
    expect(result.webhookUrl).toBe(`${publicApiUrl}/api/v1/vapi/webhook`);
    expect(result.credentialIdIncluded).toBe(true);

    expect(state.tools).toHaveLength(5);
    const functionNames = state.tools.map(
      (tool) => (tool.function as { name: string }).name,
    );
    expect(functionNames).toEqual(
      expect.arrayContaining([
        VAPI_LLM_FUNCTION_NAMES.currentDateTime,
        VAPI_LLM_FUNCTION_NAMES.resolveDate,
        VAPI_LLM_FUNCTION_NAMES.availability,
        VAPI_LLM_FUNCTION_NAMES.nextAvailability,
        VAPI_LLM_FUNCTION_NAMES.booking,
      ]),
    );
    expect(
      state.tools.every(
        (tool) => (tool.server as { credentialId: string }).credentialId === 'cred-1',
      ),
    ).toBe(true);

    const assistant = state.assistants[0];
    expect(assistant.name).toBe(VAPI_STABLE_ASSISTANT_NAME);
    expect((assistant.model as { toolIds: string[] }).toolIds).toEqual([
      result.currentDateTimeToolId,
      result.resolveDateToolId,
      result.availabilityToolId,
      result.nextAvailabilityToolId,
      result.bookingToolId,
    ]);
    expect((assistant.server as { url: string; credentialId: string }).url).toBe(
      result.webhookUrl,
    );
    expect((assistant.server as { credentialId: string }).credentialId).toBe('cred-1');
    expect(ASSISTANT_SYSTEM_PROMPT).toContain('resolve_appointment_date');
    expect(ASSISTANT_SYSTEM_PROMPT).toContain('Never assume the current date');

    const saved = JSON.parse(
      readFileSync(path.join(repoRoot, '.vapi', 'resources.local.json'), 'utf8'),
    ) as Record<string, string>;
    expect(saved.assistantId).toBe(result.assistantId);
    expect(saved.availabilityToolId).toBe(result.availabilityToolId);
    expect(saved.bookingToolId).toBe(result.bookingToolId);
    expect(saved.currentDateTimeToolId).toBe(result.currentDateTimeToolId);
    expect(saved.resolveDateToolId).toBe(result.resolveDateToolId);
    expect(saved.nextAvailabilityToolId).toBe(result.nextAvailabilityToolId);
    expect(JSON.stringify(saved)).not.toContain(privateKey);
  });

  it('updates existing resources by stable name and avoids duplicates', async () => {
    const state = {
      tools: [
        {
          id: 'tool-datetime',
          name: VAPI_STABLE_TOOL_NAMES.currentDateTime,
          type: 'function',
          function: { name: VAPI_LLM_FUNCTION_NAMES.currentDateTime },
          server: { url: 'https://old.example.com/api/v1/vapi/tools' },
        },
        {
          id: 'tool-resolve',
          name: VAPI_STABLE_TOOL_NAMES.resolveDate,
          type: 'function',
          function: { name: VAPI_LLM_FUNCTION_NAMES.resolveDate },
          server: { url: 'https://old.example.com/api/v1/vapi/tools' },
        },
        {
          id: 'tool-avail',
          name: VAPI_STABLE_TOOL_NAMES.availability,
          type: 'function',
          function: { name: VAPI_LLM_FUNCTION_NAMES.availability },
          server: { url: 'https://old.example.com/api/v1/vapi/tools' },
        },
        {
          id: 'tool-next',
          name: VAPI_STABLE_TOOL_NAMES.nextAvailability,
          type: 'function',
          function: { name: VAPI_LLM_FUNCTION_NAMES.nextAvailability },
          server: { url: 'https://old.example.com/api/v1/vapi/tools' },
        },
        {
          id: 'tool-book',
          name: VAPI_STABLE_TOOL_NAMES.booking,
          type: 'function',
          function: { name: VAPI_LLM_FUNCTION_NAMES.booking },
          server: { url: 'https://old.example.com/api/v1/vapi/tools' },
        },
      ],
      assistants: [
        {
          id: 'asst-existing',
          name: VAPI_STABLE_ASSISTANT_NAME,
          model: { provider: 'openai', model: 'gpt-4o', toolIds: [] },
          server: { url: 'https://old.example.com/api/v1/vapi/webhook' },
          serverMessages: ['status-update'],
        },
      ],
    };

    let createToolCalls = 0;
    let createAssistantCalls = 0;

    const fetchImpl = createMockFetch(
      withHealthyPublicApi((url, init) => {
        const method = (init?.method ?? 'GET').toUpperCase();
        const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;

        if (url.endsWith('/tool') && method === 'GET') {
          return { status: 200, body: state.tools };
        }
        if (url.endsWith('/assistant') && method === 'GET') {
          return { status: 200, body: state.assistants };
        }
        if (url.includes('/tool/') && method === 'PATCH' && body) {
          const id = url.split('/').pop()!;
          const index = state.tools.findIndex((tool) => tool.id === id);
          state.tools[index] = { ...state.tools[index], ...body, id };
          return { status: 200, body: state.tools[index] };
        }
        if (url.includes('/assistant/') && method === 'PATCH' && body) {
          state.assistants[0] = { ...state.assistants[0], ...body, id: 'asst-existing' };
          return { status: 200, body: state.assistants[0] };
        }
        if (url.endsWith('/assistant/asst-existing') && method === 'GET') {
          return { status: 200, body: state.assistants[0] };
        }
        if (url.endsWith('/tool') && method === 'POST') {
          createToolCalls += 1;
          return { status: 201, body: { id: 'new-tool' } };
        }
        if (url.endsWith('/assistant') && method === 'POST') {
          createAssistantCalls += 1;
          return { status: 201, body: { id: 'new-asst' } };
        }
        return { status: 404, body: { message: 'not found' } };
      }),
    );

    const env = validateProvisioningEnv({
      NODE_ENV: 'test',
      VAPI_PRIVATE_KEY: privateKey,
      PUBLIC_API_URL: publicApiUrl,
      VAPI_WEBHOOK_SECRET: 'secret',
    });

    const service = VapiManagementService.createStandalone({
      client: new VapiHttpClient({
        apiBaseUrl: 'https://api.vapi.ai',
        privateKey,
        fetchImpl,
      }),
      repoRoot,
      fetchImpl,
      logger: {
        log: () => undefined,
        warn: () => undefined,
        error: () => undefined,
      },
    });

    const result = await service.provision(env);

    expect(createToolCalls).toBe(0);
    expect(createAssistantCalls).toBe(0);
    expect(result.created.availabilityTool).toBe(false);
    expect(result.created.bookingTool).toBe(false);
    expect(result.created.currentDateTimeTool).toBe(false);
    expect(result.created.resolveDateTool).toBe(false);
    expect(result.created.nextAvailabilityTool).toBe(false);
    expect(result.created.assistant).toBe(false);
    expect(result.assistantId).toBe('asst-existing');
    expect(result.credentialIdIncluded).toBe(false);
    expect((state.tools[0].server as { credentialId?: string }).credentialId).toBeUndefined();
    expect((state.assistants[0].model as { toolIds: string[] }).toolIds).toEqual([
      'tool-datetime',
      'tool-resolve',
      'tool-avail',
      'tool-next',
      'tool-book',
    ]);
    expect((state.assistants[0].server as { url: string }).url).toBe(
      `${publicApiUrl}/api/v1/vapi/webhook`,
    );
  });

  it('uses VAPI_ASSISTANT_ID when supplied instead of creating another assistant', async () => {
    const state = {
      tools: [
        {
          id: 'tool-datetime',
          name: VAPI_STABLE_TOOL_NAMES.currentDateTime,
          function: { name: VAPI_LLM_FUNCTION_NAMES.currentDateTime },
          server: { url: `${publicApiUrl}/api/v1/vapi/tools` },
        },
        {
          id: 'tool-resolve',
          name: VAPI_STABLE_TOOL_NAMES.resolveDate,
          function: { name: VAPI_LLM_FUNCTION_NAMES.resolveDate },
          server: { url: `${publicApiUrl}/api/v1/vapi/tools` },
        },
        {
          id: 'tool-avail',
          name: VAPI_STABLE_TOOL_NAMES.availability,
          function: { name: VAPI_LLM_FUNCTION_NAMES.availability },
          server: { url: `${publicApiUrl}/api/v1/vapi/tools` },
        },
        {
          id: 'tool-next',
          name: VAPI_STABLE_TOOL_NAMES.nextAvailability,
          function: { name: VAPI_LLM_FUNCTION_NAMES.nextAvailability },
          server: { url: `${publicApiUrl}/api/v1/vapi/tools` },
        },
        {
          id: 'tool-book',
          name: VAPI_STABLE_TOOL_NAMES.booking,
          function: { name: VAPI_LLM_FUNCTION_NAMES.booking },
          server: { url: `${publicApiUrl}/api/v1/vapi/tools` },
        },
      ],
      assistant: {
        id: 'asst-configured',
        name: 'Old Name',
        model: { provider: 'openai', model: 'gpt-4o', toolIds: [] },
        server: { url: 'https://old.example.com/webhook' },
      },
    };

    let createAssistantCalls = 0;
    const fetchImpl = createMockFetch(
      withHealthyPublicApi((url, init) => {
        const method = (init?.method ?? 'GET').toUpperCase();
        const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null;

        if (url.endsWith('/tool') && method === 'GET') {
          return { status: 200, body: state.tools };
        }
        if (url.endsWith('/assistant') && method === 'GET') {
          return { status: 200, body: [{ id: 'other', name: VAPI_STABLE_ASSISTANT_NAME }] };
        }
        if (
          url.includes('/tool/tool-') &&
          (method === 'GET' || method === 'PATCH')
        ) {
          if (method === 'PATCH' && body) {
            const id = url.split('/').pop()!;
            const index = state.tools.findIndex((tool) => tool.id === id);
            state.tools[index] = { ...state.tools[index], ...body, id };
            return { status: 200, body: state.tools[index] };
          }
          return {
            status: 200,
            body: state.tools.find((tool) => url.endsWith(tool.id as string)),
          };
        }
        if (url.endsWith('/assistant/asst-configured')) {
          if (method === 'PATCH' && body) {
            state.assistant = { ...state.assistant, ...body, id: 'asst-configured' };
            return { status: 200, body: state.assistant };
          }
          return { status: 200, body: state.assistant };
        }
        if (url.endsWith('/assistant') && method === 'POST') {
          createAssistantCalls += 1;
          return { status: 201, body: { id: 'should-not-create' } };
        }
        return { status: 404, body: { message: 'not found' } };
      }),
    );

    const env = validateProvisioningEnv({
      NODE_ENV: 'test',
      VAPI_PRIVATE_KEY: privateKey,
      PUBLIC_API_URL: publicApiUrl,
      VAPI_WEBHOOK_SECRET: 'secret',
      VAPI_ASSISTANT_ID: 'asst-configured',
      VAPI_ASSISTANT_NAME: VAPI_STABLE_ASSISTANT_NAME,
    });

    const service = VapiManagementService.createStandalone({
      client: new VapiHttpClient({
        apiBaseUrl: 'https://api.vapi.ai',
        privateKey,
        fetchImpl,
      }),
      repoRoot,
      fetchImpl,
      logger: {
        log: () => undefined,
        warn: () => undefined,
        error: () => undefined,
      },
    });

    const result = await service.provision(env);
    expect(createAssistantCalls).toBe(0);
    expect(result.assistantId).toBe('asst-configured');
    expect(state.assistant.name).toBe(VAPI_STABLE_ASSISTANT_NAME);
  });

  it('rejects HTTP PUBLIC_API_URL before calling Vapi because Vapi requires HTTPS server URLs', async () => {
    let listToolsCalls = 0;
    const fetchImpl = createMockFetch((url) => {
      if (url.endsWith('/tool')) {
        listToolsCalls += 1;
      }
      return { status: 200, body: [] };
    });

    const env = validateProvisioningEnv({
      NODE_ENV: 'development',
      VAPI_PRIVATE_KEY: privateKey,
      PUBLIC_API_URL: 'http://103.208.181.253:4000',
      VAPI_WEBHOOK_SECRET: 'secret',
      VAPI_CREDENTIAL_ID: 'cred-1',
      ALLOW_INSECURE_PUBLIC_API_URL: 'true',
      ALLOW_INSECURE_VAPI_CREDENTIAL_TRANSPORT: 'true',
      SKIP_PUBLIC_API_PREFLIGHT: 'true',
    });

    const service = VapiManagementService.createStandalone({
      client: new VapiHttpClient({
        apiBaseUrl: 'https://api.vapi.ai',
        privateKey,
        fetchImpl,
      }),
      repoRoot,
      fetchImpl,
      logger: {
        log: () => undefined,
        warn: () => undefined,
        error: () => undefined,
      },
    });

    await expect(service.provision(env)).rejects.toThrow('Vapi requires HTTPS');
    expect(listToolsCalls).toBe(0);
  });

  it('fails before provisioning when the public health endpoint is unreachable', async () => {
    let listToolsCalls = 0;
    const fetchImpl = createMockFetch((url) => {
      if (url.endsWith('/health')) {
        return { status: 503, body: { status: 'down' } };
      }
      if (url.endsWith('/tool')) {
        listToolsCalls += 1;
      }
      return { status: 200, body: [] };
    });

    const env = validateProvisioningEnv({
      NODE_ENV: 'test',
      VAPI_PRIVATE_KEY: privateKey,
      PUBLIC_API_URL: publicApiUrl,
      VAPI_WEBHOOK_SECRET: 'secret',
    });

    const service = VapiManagementService.createStandalone({
      client: new VapiHttpClient({
        apiBaseUrl: 'https://api.vapi.ai',
        privateKey,
        fetchImpl,
      }),
      repoRoot,
      fetchImpl,
      logger: {
        log: () => undefined,
        warn: () => undefined,
        error: () => undefined,
      },
    });

    await expect(service.provision(env)).rejects.toThrow('Public API preflight failed');
    expect(listToolsCalls).toBe(0);
  });

  it('redacts private keys from Vapi API error messages', async () => {
    const fetchImpl = createMockFetch(() => ({
      status: 401,
      body: { message: `Unauthorized key ${privateKey}` },
    }));

    const client = new VapiHttpClient({
      apiBaseUrl: 'https://api.vapi.ai',
      privateKey,
      fetchImpl,
    });

    await expect(client.listTools()).rejects.toMatchObject({
      message: expect.not.stringContaining(privateKey),
    });
  });

  it('safely updates NEXT_PUBLIC_VAPI_ASSISTANT_ID in apps/web/.env without modifying other values', async () => {
    const webDir = path.join(repoRoot, 'apps', 'web');
    mkdirSync(webDir, { recursive: true });
    writeFileSync(
      path.join(webDir, '.env'),
      'NEXT_PUBLIC_API_URL=http://localhost:4000\nNEXT_PUBLIC_VAPI_PUBLIC_KEY=pk_test\nNEXT_PUBLIC_VAPI_ASSISTANT_ID=old\n',
      'utf8',
    );

    const envPath = await writeWebEnv(repoRoot, 'asst-new');
    expect(envPath.endsWith(path.join('apps', 'web', '.env'))).toBe(true);

    const content = readFileSync(path.join(webDir, '.env'), 'utf8');
    expect(content).toContain('NEXT_PUBLIC_API_URL=http://localhost:4000');
    expect(content).toContain('NEXT_PUBLIC_VAPI_PUBLIC_KEY=pk_test');
    expect(content).toContain('NEXT_PUBLIC_VAPI_ASSISTANT_ID=asst-new');
    expect(content).not.toContain(privateKey);
    expect(content).not.toContain('VAPI_PRIVATE_KEY');
    expect(content).not.toContain('VAPI_WEBHOOK_SECRET');
    expect(content).not.toContain('DATABASE_URL');
  });
});
