/**
 * Local Vapi tools smoke test (does not call the real Vapi cloud API).
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { VapiService } from '../vapi/vapi.service';
import { loadApiEnvFile, resolveRepoRoot } from '../modules/vapi/load-api-env';

loadApiEnvFile(resolveRepoRoot());

function parseArgs(argv: string[]) {
  const map = new Map<string, string>();
  for (const part of argv) {
    if (!part.startsWith('--')) continue;
    const [key, ...rest] = part.slice(2).split('=');
    map.set(key, rest.join('=') || 'true');
  }
  return {
    date: map.get('date') ?? '2026-08-09',
    time: map.get('time') ?? 'morning',
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
    abortOnError: false,
  });
  try {
    const vapi = app.get(VapiService);
    const response = await vapi.handleTools({
      message: {
        type: 'tool-calls',
        toolCallList: [
          {
            id: 'local-datetime-1',
            function: {
              name: 'get_current_datetime',
              arguments: { organizationSlug: 'carepoint-clinic' },
            },
          },
          {
            id: 'local-resolve-1',
            function: {
              name: 'resolve_appointment_date',
              arguments: {
                organizationSlug: 'carepoint-clinic',
                dateExpression: 'tomorrow',
              },
            },
          },
          {
            id: 'local-audit-1',
            function: {
              name: 'check_appointment_availability',
              arguments: {
                organizationSlug: 'carepoint-clinic',
                serviceName: 'General Consultation',
                date: args.date,
                timePreference: args.time,
                timezone: 'Asia/Dhaka',
              },
            },
          },
          {
            id: 'local-next-1',
            function: {
              name: 'find_next_available_appointment',
              arguments: {
                organizationSlug: 'carepoint-clinic',
                serviceName: 'General Consultation',
                timePreference: 'any',
              },
            },
          },
        ],
      },
    });

    console.log(JSON.stringify(response, null, 2));
    const availability = response.results.find((item) => item.toolCallId === 'local-audit-1')
      ?.result as { success?: boolean; available?: boolean; options?: unknown[] };
    if (!availability?.success || !availability.available || !availability.options?.length) {
      console.error('Vapi local tool test did not return available slots');
      process.exitCode = 1;
    }
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
