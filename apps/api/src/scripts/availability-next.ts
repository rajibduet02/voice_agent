import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { NextAvailabilityService } from '../date-time/next-availability.service';
import { loadApiEnvFile, resolveRepoRoot } from '../modules/vapi/load-api-env';

loadApiEnvFile(resolveRepoRoot());

function arg(name: string, fallback: string) {
  const match = process.argv.find((part) => part.startsWith(`--${name}=`));
  return match ? match.slice(name.length + 3) : fallback;
}

async function main() {
  const organization = arg('organization', 'carepoint-clinic');
  const serviceName = arg('service', 'General Consultation');
  const time = arg('time', 'any');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
    abortOnError: false,
  });
  try {
    const service = app.get(NextAvailabilityService);
    const result = await service.findNextAvailable({
      organizationSlug: organization,
      serviceName,
      timePreference: time,
    });
    console.log(`Search starting date: ${result.searchedFrom}`);
    console.log(`Service: ${result.service?.name ?? serviceName}`);
    if (!result.available) {
      console.log(`Available: false`);
      console.log(result.message);
      console.log(`Searched through: ${result.searchedThrough}`);
      return;
    }
    console.log(`Next available date: ${result.nextAvailableDate}`);
    const first = result.options[0] as {
      displayStart?: string;
      timezone?: string;
      providerName?: string;
    };
    console.log(`First slot: ${first?.displayStart} ${first?.timezone}`);
    console.log(`Provider: ${first?.providerName}`);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
