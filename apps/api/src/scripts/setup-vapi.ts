import { validateProvisioningEnv } from '../config/env.validation';
import { VapiHttpClient } from '../modules/vapi/vapi-http.client';
import { VapiManagementService } from '../modules/vapi/vapi-management.service';
import { loadApiEnvFile, resolveRepoRoot } from '../modules/vapi/load-api-env';
import { writeWebEnv as writeWebEnvFile } from '../modules/vapi/web-env.util';

async function main() {
  const repoRoot = resolveRepoRoot();
  loadApiEnvFile(repoRoot);

  const shouldWriteWebEnv = process.argv.includes('--write-web-env');
  const env = validateProvisioningEnv(process.env as Record<string, unknown>);
  for (const warning of env.warnings) {
    console.warn(warning);
  }

  const client = new VapiHttpClient({
    apiBaseUrl: env.VAPI_API_BASE_URL,
    privateKey: env.VAPI_PRIVATE_KEY,
  });

  const service = VapiManagementService.createStandalone({
    client,
    repoRoot,
    logger: {
      log: (message: string) => console.log(message),
      warn: (message: string) => console.warn(message),
      error: (message: string) => console.error(message),
    },
  });

  const result = await service.provision(env);

  console.log('');
  console.log('Vapi provisioning completed successfully.');
  console.log(`Public API URL: ${result.publicApiUrl}`);
  console.log(`Protocol: ${env.publicApiProtocol}`);
  console.log(
    `Insecure development mode: ${env.insecureDevelopmentMode ? 'enabled' : 'disabled'}`,
  );
  console.log(`Current datetime tool ID: ${result.currentDateTimeToolId}`);
  console.log(`Resolve date tool ID: ${result.resolveDateToolId}`);
  console.log(`Availability tool ID: ${result.availabilityToolId}`);
  console.log(`Next availability tool ID: ${result.nextAvailabilityToolId}`);
  console.log(`Booking tool ID: ${result.bookingToolId}`);
  console.log(`Tools URL: ${result.toolsUrl}`);
  console.log(`Webhook URL: ${result.webhookUrl}`);
  console.log(`Credential ID included: ${result.credentialIdIncluded ? 'yes' : 'no'}`);
  console.log('');
  console.log(`VAPI ASSISTANT ID: ${result.assistantId}`);
  console.log('');
  console.log('Add this line to apps/web/.env (local) or your web hosting env (deployed):');
  console.log(`NEXT_PUBLIC_VAPI_ASSISTANT_ID=${result.assistantId}`);
  console.log('');
  console.log(
    'Also set NEXT_PUBLIC_VAPI_PUBLIC_KEY manually (public key only). For local development use apps/web/.env.',
  );

  if (shouldWriteWebEnv) {
    const envPath = await writeWebEnvFile(repoRoot, result.assistantId);
    console.log(`Updated ${envPath}:`);
    console.log(`NEXT_PUBLIC_VAPI_ASSISTANT_ID=${result.assistantId}`);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Vapi provisioning failed';
  // Never print private keys or authorization headers.
  console.error(`Provisioning failed: ${message}`);
  process.exitCode = 1;
});
