export type VapiServerConfig = {
  url: string;
  credentialId?: string;
};

export type VapiJsonSchemaProperty = {
  type: string;
  description?: string;
  enum?: string[];
};

export type VapiFunctionParameters = {
  type: 'object';
  properties: Record<string, VapiJsonSchemaProperty>;
  required?: string[];
};

export type VapiToolFunction = {
  name: string;
  description?: string;
  parameters?: VapiFunctionParameters;
};

export type VapiTool = {
  id: string;
  type?: string;
  /** Optional resource/display name when present on the API object. */
  name?: string;
  function?: VapiToolFunction;
  server?: VapiServerConfig;
};

export type VapiAssistantModel = {
  provider?: string;
  model?: string;
  messages?: Array<{ role: string; content: string }>;
  toolIds?: string[];
};

export type VapiAssistant = {
  id: string;
  name?: string;
  firstMessage?: string;
  model?: VapiAssistantModel;
  voice?: Record<string, unknown>;
  transcriber?: Record<string, unknown>;
  server?: VapiServerConfig;
  serverUrl?: string;
  serverMessages?: string[];
};

export type CreateFunctionToolPayload = {
  type: 'function';
  function: VapiToolFunction;
  server: VapiServerConfig;
  async?: boolean;
  messages?: Array<{ type: string; content?: string; [key: string]: unknown }>;
};

export type CreateAssistantPayload = {
  name: string;
  firstMessage: string;
  model: {
    provider: string;
    model: string;
    messages: Array<{ role: 'system'; content: string }>;
    toolIds: string[];
  };
  voice: {
    provider: string;
    voiceId: string;
  };
  transcriber: {
    provider: string;
    model: string;
    language: string;
  };
  server: VapiServerConfig;
  serverMessages: string[];
};

export type VapiResourceState = {
  assistantId: string;
  availabilityToolId: string;
  bookingToolId: string;
  currentDateTimeToolId: string;
  resolveDateToolId: string;
  nextAvailabilityToolId: string;
  publicApiUrl: string;
  updatedAt: string;
};

export type ProvisionResult = {
  assistantId: string;
  availabilityToolId: string;
  bookingToolId: string;
  currentDateTimeToolId: string;
  resolveDateToolId: string;
  nextAvailabilityToolId: string;
  publicApiUrl: string;
  toolsUrl: string;
  webhookUrl: string;
  created: {
    availabilityTool: boolean;
    bookingTool: boolean;
    currentDateTimeTool: boolean;
    resolveDateTool: boolean;
    nextAvailabilityTool: boolean;
    assistant: boolean;
  };
  credentialIdIncluded: boolean;
};

export type VerifyResult = {
  ok: boolean;
  publicApiUrl: string;
  protocol: 'HTTP' | 'HTTPS';
  insecureDevelopmentMode: boolean;
  assistantId: string;
  availabilityToolId: string;
  bookingToolId: string;
  currentDateTimeToolId: string;
  resolveDateToolId: string;
  nextAvailabilityToolId: string;
  toolsUrl: string;
  webhookUrl: string;
  reachability: {
    checked: boolean;
    skipped: boolean;
    ok: boolean;
    status?: number;
    message: string;
  };
  issues: string[];
};
