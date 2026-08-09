import { Injectable, Logger } from '@nestjs/common';
import { ProvisioningEnv } from '../../config/env.validation';
import { checkPublicApiReachability } from '../../config/public-api-url';
import {
  buildAssistantPayload,
  buildAvailabilityToolPayload,
  buildBookingToolPayload,
  buildCurrentDateTimeToolPayload,
  buildNextAvailabilityToolPayload,
  buildResolveDateToolPayload,
  VAPI_LLM_FUNCTION_NAMES,
  VAPI_SERVER_EVENTS,
  VAPI_STABLE_TOOL_NAMES,
} from './vapi-assistant.config';
import { VapiHttpClient, VapiHttpError } from './vapi-http.client';
import {
  CreateFunctionToolPayload,
  ProvisionResult,
  VapiAssistant,
  VapiResourceState,
  VapiTool,
  VerifyResult,
} from './vapi-management.types';
import { loadResourceState, saveResourceState } from './vapi-resource-state';

export type VapiManagementDependencies = {
  client: VapiHttpClient;
  repoRoot: string;
  logger?: Pick<Logger, 'log' | 'warn' | 'error'>;
  fetchImpl?: typeof fetch;
};

@Injectable()
export class VapiManagementService {
  private readonly logger = new Logger(VapiManagementService.name);

  constructor(private readonly deps?: VapiManagementDependencies) {}

  static createStandalone(deps: VapiManagementDependencies): VapiManagementService {
    return new VapiManagementService(deps);
  }

  async provision(env: ProvisioningEnv): Promise<ProvisionResult> {
    const { client, repoRoot, logger, fetchImpl } = this.requireDeps();
    const log = logger ?? this.logger;

    for (const warning of env.warnings) {
      log.warn(warning);
    }

    if (!env.VAPI_CREDENTIAL_ID) {
      log.warn(
        'VAPI_CREDENTIAL_ID is not set. Tool and webhook requests from Vapi will be unauthenticated unless you secure the public tunnel another way. Production provisioning requires VAPI_CREDENTIAL_ID.',
      );
    }

    const toolsUrl = `${env.PUBLIC_API_URL}/api/v1/vapi/tools`;
    const webhookUrl = `${env.PUBLIC_API_URL}/api/v1/vapi/webhook`;

    // Vapi's own API rejects non-HTTPS tool/webhook server URLs regardless of local overrides.
    if (env.publicApiProtocol === 'HTTP') {
      throw new Error(
        `Vapi requires HTTPS (or WSS) for tool and assistant server URLs. PUBLIC_API_URL is currently HTTP (${env.PUBLIC_API_URL}). Start a tunnel such as "ngrok http 4000", set PUBLIC_API_URL to the https://... URL, then rerun npm run vapi:setup:web-env.`,
      );
    }

    const reachability = await checkPublicApiReachability(env.PUBLIC_API_URL, {
      fetchImpl,
      skip: env.skipPublicApiPreflight,
    });
    if (!reachability.ok) {
      throw new Error(
        `Public API preflight failed before modifying Vapi resources. ${reachability.message}`,
      );
    }
    log.log(reachability.message);

    const stored = await loadResourceState(repoRoot);

    const tools = await client.listTools();
    const credentialId = env.VAPI_CREDENTIAL_ID;

    const currentDateTime = await this.upsertTool({
      client,
      tools,
      storedId: stored?.currentDateTimeToolId || undefined,
      stableName: VAPI_STABLE_TOOL_NAMES.currentDateTime,
      llmFunctionName: VAPI_LLM_FUNCTION_NAMES.currentDateTime,
      payload: buildCurrentDateTimeToolPayload(toolsUrl, credentialId),
      log,
    });

    const resolveDate = await this.upsertTool({
      client,
      tools,
      storedId: stored?.resolveDateToolId || undefined,
      stableName: VAPI_STABLE_TOOL_NAMES.resolveDate,
      llmFunctionName: VAPI_LLM_FUNCTION_NAMES.resolveDate,
      payload: buildResolveDateToolPayload(toolsUrl, credentialId),
      log,
    });

    const availability = await this.upsertTool({
      client,
      tools,
      storedId: stored?.availabilityToolId,
      stableName: VAPI_STABLE_TOOL_NAMES.availability,
      llmFunctionName: VAPI_LLM_FUNCTION_NAMES.availability,
      payload: buildAvailabilityToolPayload(toolsUrl, credentialId),
      log,
    });

    const nextAvailability = await this.upsertTool({
      client,
      tools,
      storedId: stored?.nextAvailabilityToolId || undefined,
      stableName: VAPI_STABLE_TOOL_NAMES.nextAvailability,
      llmFunctionName: VAPI_LLM_FUNCTION_NAMES.nextAvailability,
      payload: buildNextAvailabilityToolPayload(toolsUrl, credentialId),
      log,
    });

    const booking = await this.upsertTool({
      client,
      tools,
      storedId: stored?.bookingToolId,
      stableName: VAPI_STABLE_TOOL_NAMES.booking,
      llmFunctionName: VAPI_LLM_FUNCTION_NAMES.booking,
      payload: buildBookingToolPayload(toolsUrl, credentialId),
      log,
    });

    const toolIds = [
      currentDateTime.tool.id,
      resolveDate.tool.id,
      availability.tool.id,
      nextAvailability.tool.id,
      booking.tool.id,
    ];

    const assistants = await client.listAssistants();
    const assistant = await this.upsertAssistant({
      client,
      assistants,
      storedId: stored?.assistantId,
      configuredId: env.VAPI_ASSISTANT_ID,
      name: env.VAPI_ASSISTANT_NAME,
      toolIds,
      webhookUrl,
      credentialId,
      log,
    });

    const verified = await client.getAssistant(assistant.assistant.id);
    this.assertAssistantConfigured(verified, {
      toolIds,
      webhookUrl,
      name: env.VAPI_ASSISTANT_NAME,
    });

    await saveResourceState(repoRoot, {
      assistantId: verified.id,
      availabilityToolId: availability.tool.id,
      bookingToolId: booking.tool.id,
      currentDateTimeToolId: currentDateTime.tool.id,
      resolveDateToolId: resolveDate.tool.id,
      nextAvailabilityToolId: nextAvailability.tool.id,
      publicApiUrl: env.PUBLIC_API_URL,
    });

    return {
      assistantId: verified.id,
      availabilityToolId: availability.tool.id,
      bookingToolId: booking.tool.id,
      currentDateTimeToolId: currentDateTime.tool.id,
      resolveDateToolId: resolveDate.tool.id,
      nextAvailabilityToolId: nextAvailability.tool.id,
      publicApiUrl: env.PUBLIC_API_URL,
      toolsUrl,
      webhookUrl,
      created: {
        availabilityTool: availability.created,
        bookingTool: booking.created,
        currentDateTimeTool: currentDateTime.created,
        resolveDateTool: resolveDate.created,
        nextAvailabilityTool: nextAvailability.created,
        assistant: assistant.created,
      },
      credentialIdIncluded: Boolean(env.VAPI_CREDENTIAL_ID),
    };
  }

  async verify(env: ProvisioningEnv): Promise<VerifyResult> {
    const { client, repoRoot, fetchImpl } = this.requireDeps();
    const toolsUrl = `${env.PUBLIC_API_URL}/api/v1/vapi/tools`;
    const webhookUrl = `${env.PUBLIC_API_URL}/api/v1/vapi/webhook`;
    const issues: string[] = [];

    const reachability = await checkPublicApiReachability(env.PUBLIC_API_URL, {
      fetchImpl,
      skip: env.skipPublicApiPreflight,
    });
    if (!reachability.ok) {
      issues.push(reachability.message);
    }

    const stored = await loadResourceState(repoRoot);
    const tools = await client.listTools();
    const assistants = await client.listAssistants();

    const currentDateTime = await this.resolveExistingTool({
      client,
      tools,
      storedId: stored?.currentDateTimeToolId || undefined,
      stableName: VAPI_STABLE_TOOL_NAMES.currentDateTime,
      llmFunctionName: VAPI_LLM_FUNCTION_NAMES.currentDateTime,
    });
    const resolveDate = await this.resolveExistingTool({
      client,
      tools,
      storedId: stored?.resolveDateToolId || undefined,
      stableName: VAPI_STABLE_TOOL_NAMES.resolveDate,
      llmFunctionName: VAPI_LLM_FUNCTION_NAMES.resolveDate,
    });
    const availability = await this.resolveExistingTool({
      client,
      tools,
      storedId: stored?.availabilityToolId,
      stableName: VAPI_STABLE_TOOL_NAMES.availability,
      llmFunctionName: VAPI_LLM_FUNCTION_NAMES.availability,
    });
    const nextAvailability = await this.resolveExistingTool({
      client,
      tools,
      storedId: stored?.nextAvailabilityToolId || undefined,
      stableName: VAPI_STABLE_TOOL_NAMES.nextAvailability,
      llmFunctionName: VAPI_LLM_FUNCTION_NAMES.nextAvailability,
    });
    const booking = await this.resolveExistingTool({
      client,
      tools,
      storedId: stored?.bookingToolId,
      stableName: VAPI_STABLE_TOOL_NAMES.booking,
      llmFunctionName: VAPI_LLM_FUNCTION_NAMES.booking,
    });

    const requiredTools = [
      { tool: currentDateTime, label: 'Current datetime tool', stable: VAPI_STABLE_TOOL_NAMES.currentDateTime },
      { tool: resolveDate, label: 'Resolve date tool', stable: VAPI_STABLE_TOOL_NAMES.resolveDate },
      { tool: availability, label: 'Availability tool', stable: VAPI_STABLE_TOOL_NAMES.availability },
      { tool: nextAvailability, label: 'Next availability tool', stable: VAPI_STABLE_TOOL_NAMES.nextAvailability },
      { tool: booking, label: 'Booking tool', stable: VAPI_STABLE_TOOL_NAMES.booking },
    ];

    for (const entry of requiredTools) {
      if (!entry.tool) {
        issues.push(`Missing tool ${entry.stable}`);
        continue;
      }
      if (entry.tool.server?.url !== toolsUrl) {
        issues.push(
          `${entry.label} server URL mismatch (expected ${toolsUrl}, got ${entry.tool.server?.url ?? 'none'})`,
        );
      }
      this.checkCredential(entry.tool, env.VAPI_CREDENTIAL_ID, entry.label, issues);
    }

    const assistant = await this.resolveExistingAssistant({
      client,
      assistants,
      storedId: stored?.assistantId,
      configuredId: env.VAPI_ASSISTANT_ID,
      name: env.VAPI_ASSISTANT_NAME,
    });

    if (!assistant) {
      issues.push(`Missing assistant ${env.VAPI_ASSISTANT_NAME}`);
    } else {
      const toolIds = assistant.model?.toolIds ?? [];
      for (const entry of requiredTools) {
        if (entry.tool && !toolIds.includes(entry.tool.id)) {
          issues.push(`Assistant is missing the ${entry.label.toLowerCase()} ID`);
        }
      }

      const assistantServerUrl = assistant.server?.url ?? assistant.serverUrl;
      if (assistantServerUrl !== webhookUrl) {
        issues.push(
          `Assistant webhook URL mismatch (expected ${webhookUrl}, got ${assistantServerUrl ?? 'none'})`,
        );
      }

      for (const eventName of VAPI_SERVER_EVENTS) {
        if (!assistant.serverMessages?.includes(eventName)) {
          issues.push(`Assistant is missing server event subscription: ${eventName}`);
        }
      }

      if (env.VAPI_CREDENTIAL_ID) {
        if (assistant.server?.credentialId !== env.VAPI_CREDENTIAL_ID) {
          issues.push('Assistant server credentialId does not match VAPI_CREDENTIAL_ID');
        }
      }
    }

    return {
      ok: issues.length === 0,
      publicApiUrl: env.PUBLIC_API_URL,
      protocol: env.publicApiProtocol,
      insecureDevelopmentMode: env.insecureDevelopmentMode,
      assistantId: assistant?.id ?? '',
      availabilityToolId: availability?.id ?? '',
      bookingToolId: booking?.id ?? '',
      currentDateTimeToolId: currentDateTime?.id ?? '',
      resolveDateToolId: resolveDate?.id ?? '',
      nextAvailabilityToolId: nextAvailability?.id ?? '',
      toolsUrl,
      webhookUrl,
      reachability: {
        checked: reachability.checked,
        skipped: reachability.skipped,
        ok: reachability.ok,
        status: reachability.status,
        message: reachability.message,
      },
      issues,
    };
  }

  private async upsertTool(params: {
    client: VapiHttpClient;
    tools: VapiTool[];
    storedId?: string;
    stableName: string;
    llmFunctionName: string;
    payload: CreateFunctionToolPayload;
    log: Pick<Logger, 'log' | 'warn' | 'error'>;
  }): Promise<{ tool: VapiTool; created: boolean }> {
    const existing = await this.resolveExistingTool({
      client: params.client,
      tools: params.tools,
      storedId: params.storedId,
      stableName: params.stableName,
      llmFunctionName: params.llmFunctionName,
    });

    if (existing) {
      params.log.log(`Updating Vapi tool ${params.stableName} (${existing.id})`);
      const updated = await params.client.updateTool(existing.id, params.payload);
      return { tool: updated, created: false };
    }

    params.log.log(`Creating Vapi tool ${params.stableName}`);
    const created = await params.client.createTool(params.payload);
    return { tool: created, created: true };
  }

  private async upsertAssistant(params: {
    client: VapiHttpClient;
    assistants: VapiAssistant[];
    storedId?: string;
    configuredId?: string;
    name: string;
    toolIds: string[];
    webhookUrl: string;
    credentialId?: string;
    log: Pick<Logger, 'log' | 'warn' | 'error'>;
  }): Promise<{ assistant: VapiAssistant; created: boolean }> {
    const payload = buildAssistantPayload({
      name: params.name,
      toolIds: params.toolIds,
      webhookUrl: params.webhookUrl,
      credentialId: params.credentialId,
    });

    const existing = await this.resolveExistingAssistant({
      client: params.client,
      assistants: params.assistants,
      storedId: params.storedId,
      configuredId: params.configuredId,
      name: params.name,
    });

    if (existing) {
      params.log.log(`Updating Vapi assistant ${params.name} (${existing.id})`);
      const updated = await params.client.updateAssistant(existing.id, payload);
      return { assistant: updated, created: false };
    }

    params.log.log(`Creating Vapi assistant ${params.name}`);
    const created = await params.client.createAssistant(payload);
    return { assistant: created, created: true };
  }

  private async resolveExistingTool(params: {
    client: VapiHttpClient;
    tools: VapiTool[];
    storedId?: string;
    stableName: string;
    llmFunctionName: string;
  }): Promise<VapiTool | null> {
    if (params.storedId) {
      try {
        const byId = await params.client.getTool(params.storedId);
        if (this.toolMatches(byId, params.stableName, params.llmFunctionName)) {
          return byId;
        }
      } catch (error) {
        if (!(error instanceof VapiHttpError) || error.status !== 404) {
          throw error;
        }
      }
    }

    const matches = params.tools.filter((tool) =>
      this.toolMatches(tool, params.stableName, params.llmFunctionName),
    );

    if (matches.length > 1) {
      throw new Error(
        `Multiple Vapi tools matched stable name ${params.stableName}. Delete duplicates in the Vapi dashboard and rerun setup.`,
      );
    }

    return matches[0] ?? null;
  }

  private async resolveExistingAssistant(params: {
    client: VapiHttpClient;
    assistants: VapiAssistant[];
    storedId?: string;
    configuredId?: string;
    name: string;
  }): Promise<VapiAssistant | null> {
    if (params.configuredId) {
      const byConfigured = await params.client.getAssistant(params.configuredId);
      // Retrieval succeeding under the private key confirms org ownership.
      return byConfigured;
    }

    if (params.storedId) {
      try {
        return await params.client.getAssistant(params.storedId);
      } catch (error) {
        if (!(error instanceof VapiHttpError) || error.status !== 404) {
          throw error;
        }
      }
    }

    const matches = params.assistants.filter((assistant) => assistant.name === params.name);
    if (matches.length > 1) {
      throw new Error(
        `Multiple Vapi assistants named "${params.name}" were found. Set VAPI_ASSISTANT_ID or remove duplicates, then rerun setup.`,
      );
    }

    return matches[0] ?? null;
  }

  private toolMatches(tool: VapiTool, stableName: string, llmFunctionName: string): boolean {
    if (tool.name === stableName) {
      return true;
    }
    if (tool.function?.description?.includes(`[${stableName}]`)) {
      return true;
    }
    return tool.function?.name === llmFunctionName;
  }

  private assertAssistantConfigured(
    assistant: VapiAssistant,
    expected: { toolIds: string[]; webhookUrl: string; name: string },
  ) {
    if (assistant.name !== expected.name) {
      throw new Error('Provisioned assistant name verification failed');
    }
    const toolIds = assistant.model?.toolIds ?? [];
    for (const toolId of expected.toolIds) {
      if (!toolIds.includes(toolId)) {
        throw new Error('Provisioned assistant is missing an expected tool ID');
      }
    }
    const serverUrl = assistant.server?.url ?? assistant.serverUrl;
    if (serverUrl !== expected.webhookUrl) {
      throw new Error('Provisioned assistant webhook URL verification failed');
    }
  }

  private checkCredential(
    tool: VapiTool,
    credentialId: string | undefined,
    label: string,
    issues: string[],
  ) {
    if (credentialId) {
      if (tool.server?.credentialId !== credentialId) {
        issues.push(`${label} credentialId does not match VAPI_CREDENTIAL_ID`);
      }
      return;
    }
    if (tool.server?.credentialId) {
      issues.push(`${label} unexpectedly includes a credentialId`);
    }
  }

  private requireDeps(): VapiManagementDependencies {
    if (!this.deps) {
      throw new Error('VapiManagementService requires standalone dependencies for provisioning');
    }
    return this.deps;
  }
}

export type { VapiResourceState };
