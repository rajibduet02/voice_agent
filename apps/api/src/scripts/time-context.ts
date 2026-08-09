import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { OrganizationTimeService } from '../date-time/organization-time.service';
import { loadApiEnvFile, resolveRepoRoot } from '../modules/vapi/load-api-env';

loadApiEnvFile(resolveRepoRoot());

function arg(name: string, fallback: string) {
  const match = process.argv.find((part) => part.startsWith(`--${name}=`));
  return match ? match.slice(name.length + 3) : fallback;
}

async function main() {
  const organization = arg('organization', 'carepoint-clinic');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
    abortOnError: false,
  });
  try {
    const service = app.get(OrganizationTimeService);
    const context = await service.getTimeContext(organization);
    console.log(`Organization: ${context.organization.name}`);
    console.log(`Timezone: ${context.organization.timezone}`);
    console.log(`UTC now: ${context.current.utc}`);
    console.log(`Local date: ${context.current.localDate}`);
    console.log(`Local time: ${context.current.formattedTime}`);
    console.log(`Tomorrow: ${context.relativeDates.tomorrow.date}`);
    console.log(`Tomorrow weekday: ${context.relativeDates.tomorrow.dayName}`);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
