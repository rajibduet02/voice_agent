import {
  CreateAssistantPayload,
  CreateFunctionToolPayload,
  VapiAssistant,
  VapiFunctionParameters,
  VapiTool,
} from './vapi-management.types';

export class VapiHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'VapiHttpError';
  }
}

export type VapiHttpClientOptions = {
  apiBaseUrl: string;
  privateKey: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function redactSecrets(text: string, privateKey: string): string {
  if (!privateKey) {
    return text;
  }
  return text.split(privateKey).join('[REDACTED]');
}

function parseErrorMessage(body: unknown, status: number, privateKey: string): string {
  if (typeof body === 'string' && body.trim()) {
    return redactSecrets(body.slice(0, 800), privateKey);
  }
  if (isRecord(body)) {
    const message = body.message ?? body.error ?? body.msg;
    if (typeof message === 'string' && message.trim()) {
      return redactSecrets(message.slice(0, 800), privateKey);
    }
    if (Array.isArray(message)) {
      const joined = message
        .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        .join('; ');
      if (joined) {
        return redactSecrets(joined.slice(0, 800), privateKey);
      }
    }
  }
  return `Vapi API request failed with status ${status}`;
}

function asFunctionParameters(value: unknown): VapiFunctionParameters | undefined {
  if (!isRecord(value) || value.type !== 'object' || !isRecord(value.properties)) {
    return undefined;
  }

  const properties: VapiFunctionParameters['properties'] = {};
  for (const [key, raw] of Object.entries(value.properties)) {
    if (!isRecord(raw) || typeof raw.type !== 'string') {
      continue;
    }
    properties[key] = {
      type: raw.type,
      description: typeof raw.description === 'string' ? raw.description : undefined,
      enum: Array.isArray(raw.enum)
        ? raw.enum.filter((item): item is string => typeof item === 'string')
        : undefined,
    };
  }

  return {
    type: 'object',
    properties,
    required: Array.isArray(value.required)
      ? value.required.filter((item): item is string => typeof item === 'string')
      : undefined,
  };
}

function asTool(value: unknown): VapiTool | null {
  if (!isRecord(value) || typeof value.id !== 'string') {
    return null;
  }

  const fn = isRecord(value.function) ? value.function : undefined;
  const server = isRecord(value.server) ? value.server : undefined;

  return {
    id: value.id,
    type: typeof value.type === 'string' ? value.type : undefined,
    name: typeof value.name === 'string' ? value.name : undefined,
    function: fn
      ? {
          name: typeof fn.name === 'string' ? fn.name : '',
          description: typeof fn.description === 'string' ? fn.description : undefined,
          parameters: asFunctionParameters(fn.parameters),
        }
      : undefined,
    server: server
      ? {
          url: typeof server.url === 'string' ? server.url : '',
          credentialId:
            typeof server.credentialId === 'string' ? server.credentialId : undefined,
        }
      : undefined,
  };
}

function asAssistant(value: unknown): VapiAssistant | null {
  if (!isRecord(value) || typeof value.id !== 'string') {
    return null;
  }

  const model = isRecord(value.model) ? value.model : undefined;
  const server = isRecord(value.server) ? value.server : undefined;

  return {
    id: value.id,
    name: typeof value.name === 'string' ? value.name : undefined,
    firstMessage: typeof value.firstMessage === 'string' ? value.firstMessage : undefined,
    model: model
      ? {
          provider: typeof model.provider === 'string' ? model.provider : undefined,
          model: typeof model.model === 'string' ? model.model : undefined,
          messages: Array.isArray(model.messages)
            ? model.messages
                .filter(isRecord)
                .map((message) => ({
                  role: typeof message.role === 'string' ? message.role : 'unknown',
                  content: typeof message.content === 'string' ? message.content : '',
                }))
            : undefined,
          toolIds: Array.isArray(model.toolIds)
            ? model.toolIds.filter((id): id is string => typeof id === 'string')
            : undefined,
        }
      : undefined,
    voice: isRecord(value.voice) ? value.voice : undefined,
    transcriber: isRecord(value.transcriber) ? value.transcriber : undefined,
    server: server
      ? {
          url: typeof server.url === 'string' ? server.url : '',
          credentialId:
            typeof server.credentialId === 'string' ? server.credentialId : undefined,
        }
      : undefined,
    serverUrl: typeof value.serverUrl === 'string' ? value.serverUrl : undefined,
    serverMessages: Array.isArray(value.serverMessages)
      ? value.serverMessages.filter((item): item is string => typeof item === 'string')
      : undefined,
  };
}

export class VapiHttpClient {
  private readonly apiBaseUrl: string;
  private readonly privateKey: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: VapiHttpClientOptions) {
    this.apiBaseUrl = options.apiBaseUrl.replace(/\/+$/, '');
    this.privateKey = options.privateKey;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  listAssistants(): Promise<VapiAssistant[]> {
    return this.requestArray('/assistant', asAssistant);
  }

  getAssistant(assistantId: string): Promise<VapiAssistant> {
    return this.requestOne(`/assistant/${assistantId}`, asAssistant);
  }

  createAssistant(payload: CreateAssistantPayload): Promise<VapiAssistant> {
    return this.requestOne('/assistant', asAssistant, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  updateAssistant(
    assistantId: string,
    payload: CreateAssistantPayload,
  ): Promise<VapiAssistant> {
    return this.requestOne(`/assistant/${assistantId}`, asAssistant, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  listTools(): Promise<VapiTool[]> {
    return this.requestArray('/tool', asTool);
  }

  getTool(toolId: string): Promise<VapiTool> {
    return this.requestOne(`/tool/${toolId}`, asTool);
  }

  createTool(payload: CreateFunctionToolPayload): Promise<VapiTool> {
    return this.requestOne('/tool', asTool, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  updateTool(toolId: string, payload: CreateFunctionToolPayload): Promise<VapiTool> {
    return this.requestOne(`/tool/${toolId}`, asTool, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  private async requestArray<T>(
    path: string,
    parse: (value: unknown) => T | null,
  ): Promise<T[]> {
    const data = await this.request(path, { method: 'GET' });
    if (!Array.isArray(data)) {
      throw new VapiHttpError('Vapi API returned a non-array list response', 502);
    }
    return data.map((item) => parse(item)).filter((item): item is T => item !== null);
  }

  private async requestOne<T>(
    path: string,
    parse: (value: unknown) => T | null,
    init?: RequestInit,
  ): Promise<T> {
    const data = await this.request(path, init);
    const parsed = parse(data);
    if (!parsed) {
      throw new VapiHttpError('Vapi API returned an unexpected response shape', 502);
    }
    return parsed;
  }

  private async request(path: string, init?: RequestInit): Promise<unknown> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(`${this.apiBaseUrl}${path}`, {
        ...init,
        headers: {
          Authorization: `Bearer ${this.privateKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
          ...(init?.headers ?? {}),
        },
        signal: controller.signal,
      });

      const text = await response.text();
      let body: unknown = null;
      if (text) {
        try {
          body = JSON.parse(text) as unknown;
        } catch {
          body = text;
        }
      }

      if (!response.ok) {
        throw new VapiHttpError(
          parseErrorMessage(body, response.status, this.privateKey),
          response.status,
        );
      }

      return body;
    } catch (error) {
      if (error instanceof VapiHttpError) {
        throw error;
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new VapiHttpError('Vapi API request timed out', 504);
      }
      const message =
        error instanceof Error
          ? redactSecrets(error.message, this.privateKey)
          : 'Unknown Vapi API error';
      throw new VapiHttpError(message, 502);
    } finally {
      clearTimeout(timer);
    }
  }
}
