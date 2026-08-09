import { validateProvisioningEnv } from '../config/env.validation';
import { VapiHttpClient } from '../modules/vapi/vapi-http.client';
import { VapiManagementService } from '../modules/vapi/vapi-management.service';
import { loadApiEnvFile, resolveRepoRoot } from '../modules/vapi/load-api-env';

async function main() {
  const repoRoot = resolveRepoRoot();
  loadApiEnvFile(repoRoot);

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
  });

  const result = await service.verify(env);

  console.log(`Public API URL: ${result.publicApiUrl}`);
  console.log(`Protocol: ${result.protocol}`);
  console.log(
    `Insecure development mode: ${result.insecureDevelopmentMode ? 'enabled' : 'disabled'}`,
  );
  console.log(`Tools URL: ${result.toolsUrl}`);
  console.log(`Webhook URL: ${result.webhookUrl}`);
  console.log(`Assistant ID: ${result.assistantId || '(missing)'}`);
  console.log(`Current datetime tool ID: ${result.currentDateTimeToolId || '(missing)'}`);
  console.log(`Resolve date tool ID: ${result.resolveDateToolId || '(missing)'}`);
  console.log(`Availability tool ID: ${result.availabilityToolId || '(missing)'}`);
  console.log(`Next availability tool ID: ${result.nextAvailabilityToolId || '(missing)'}`);
  console.log(`Booking tool ID: ${result.bookingToolId || '(missing)'}`);
  console.log(
    `Reachability: ${result.reachability.skipped ? 'skipped' : result.reachability.ok ? 'ok' : 'failed'}`,
  );
  console.log(`Reachability detail: ${result.reachability.message}`);

  if (!result.ok) {
    console.error('Vapi verification failed:');
    for (const issue of result.issues) {
      console.error(`- ${issue}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log('Vapi verification passed.');
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'Vapi verification failed';
  console.error(`Verification failed: ${message}`);
  process.exitCode = 1;
});
