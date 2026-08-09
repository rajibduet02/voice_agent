import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { RelativeDateService } from '../date-time/relative-date.service';
import { loadApiEnvFile, resolveRepoRoot } from '../modules/vapi/load-api-env';

loadApiEnvFile(resolveRepoRoot());

function arg(name: string, fallback: string) {
  const match = process.argv.find((part) => part.startsWith(`--${name}=`));
  return match ? match.slice(name.length + 3) : fallback;
}

async function main() {
  const organization = arg('organization', 'carepoint-clinic');
  const expression = arg('expression', 'tomorrow');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: false,
    abortOnError: false,
  });
  try {
    const service = app.get(RelativeDateService);
    const result = await service.resolveExpression({
      organizationSlug: organization,
      expression,
      allowReferenceOverride: false,
    });
    console.log(`Expression: ${expression}`);
    if (!result.success) {
      console.log(`Clarification required: ${result.message}`);
      process.exitCode = 1;
      return;
    }
    console.log(`Resolved date: ${result.resolvedDate}`);
    console.log(`Formatted: ${result.formattedDate}`);
    console.log(`Timezone: ${result.timezone}`);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
