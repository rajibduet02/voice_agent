/**
 * Safe availability audit against the live development database.
 * Usage:
 *   npx tsx src/scripts/availability-audit.ts --date=2026-08-09 --service="General Consultation" --time=morning
 */
import { PrismaClient } from '@prisma/client';
import { AvailabilityService } from '../availability/availability.service';
import { PrismaService } from '../prisma/prisma.service';
import { applicationWeekdayName, getApplicationDayOfWeek } from '../common/utils/time.util';

type Args = {
  date: string;
  service: string;
  time: string;
  organization: string;
  timezone: string;
};

function parseArgs(argv: string[]): Args {
  const map = new Map<string, string>();
  for (const part of argv) {
    if (!part.startsWith('--')) continue;
    const [key, ...rest] = part.slice(2).split('=');
    map.set(key, rest.join('=') || 'true');
  }
  return {
    date: map.get('date') ?? '2026-08-09',
    service: map.get('service') ?? 'General Consultation',
    time: map.get('time') ?? 'any',
    organization: map.get('organization') ?? 'carepoint-clinic',
    timezone: map.get('timezone') ?? 'Asia/Dhaka',
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const prisma = new PrismaClient();
  const availability = new AvailabilityService(prisma as unknown as PrismaService);

  try {
    const organization = await availability.resolveOrganization(args.organization);
    const service = await prisma.service.findFirst({
      where: {
        organizationId: organization.id,
        isActive: true,
        name: { equals: args.service, mode: 'insensitive' },
      },
    });
    if (!service) {
      console.error(`Service not found: ${args.service}`);
      process.exitCode = 1;
      return;
    }

    const location = await prisma.location.findFirst({
      where: { organizationId: organization.id, isActive: true },
      orderBy: { createdAt: 'asc' },
    });
    if (!location) {
      console.error('No active location found');
      process.exitCode = 1;
      return;
    }

    const weekday = getApplicationDayOfWeek(args.date, args.timezone);
    const audit = await availability.auditAvailability(
      {
        organizationIdOrSlug: organization.id,
        serviceId: service.id,
        locationId: location.id,
        date: args.date,
        timezone: args.timezone,
      },
      args.time,
    );

    const rules = await prisma.availabilityRule.findMany({
      where: {
        providerId: { in: audit.eligibleProviders.map((p) => p.id) },
        dayOfWeek: weekday,
        isActive: true,
      },
      select: {
        providerId: true,
        locationId: true,
        dayOfWeek: true,
        startTime: true,
        endTime: true,
        isActive: true,
      },
      orderBy: [{ startTime: 'asc' }],
    });

    console.log(`Organization: ${audit.organization.name}`);
    console.log(`Timezone: ${audit.timezone}`);
    console.log(`Requested date: ${audit.requestedDate}`);
    console.log(`Local weekday: ${applicationWeekdayName(weekday)} (${weekday})`);
    console.log(`Service: ${audit.service.name}`);
    console.log(`Location: ${audit.location.name}`);
    console.log(`Eligible providers: ${audit.eligibleProviders.length}`);
    for (const provider of audit.eligibleProviders) {
      console.log(`Provider: ${provider.name}`);
    }
    console.log(`Matching rules: ${audit.matchingRules}`);
    for (const rule of rules) {
      console.log(
        `  rule dow=${rule.dayOfWeek} ${rule.startTime}-${rule.endTime} location=${rule.locationId ? 'exact' : 'generic'}`,
      );
    }
    console.log(`Exceptions: ${audit.exceptions}`);
    console.log(`Conflicting appointments (PENDING/CONFIRMED): ${audit.conflictingAppointments}`);
    console.log(`Candidate slots: ${audit.candidateSlots}`);
    console.log(`After preference filter (${args.time}): ${audit.afterPreferenceFilter}`);
    console.log(`After conflict filter: ${audit.afterConflictFilter}`);
    console.log(`Final slots: ${audit.finalSlots.length}`);
    console.log('First five final slots:');
    for (const slot of audit.finalSlots.slice(0, 5)) {
      console.log(
        `  ${slot.providerName} ${slot.displayStart} → ${slot.endTime} (${slot.timezone})`,
      );
    }

    if (audit.eligibleProviders.length === 0) {
      console.error('ERROR: No eligible providers for service');
      process.exitCode = 1;
    }
    if (audit.matchingRules === 0 && [0, 1, 2, 3, 4].includes(weekday)) {
      console.error('ERROR: Expected availability rules for Sunday–Thursday are missing');
      process.exitCode = 1;
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
