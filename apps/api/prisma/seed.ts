import {
  Industry,
  PrismaClient,
  ProviderType,
} from '@prisma/client';

const prisma = new PrismaClient();

const ORG_SLUG = 'carepoint-clinic';

async function main() {
  const organization = await prisma.organization.upsert({
    where: { slug: ORG_SLUG },
    update: {
      name: 'CarePoint Clinic',
      industry: Industry.HEALTHCARE,
      timezone: 'Asia/Dhaka',
      slotIntervalMinutes: 15,
      phone: '+8809600000000',
      email: 'hello@carepoint.example',
      isActive: true,
    },
    create: {
      name: 'CarePoint Clinic',
      slug: ORG_SLUG,
      industry: Industry.HEALTHCARE,
      timezone: 'Asia/Dhaka',
      slotIntervalMinutes: 15,
      phone: '+8809600000000',
      email: 'hello@carepoint.example',
      isActive: true,
    },
  });

  const existingLocations = await prisma.location.findMany({
    where: { organizationId: organization.id },
  });

  let location = existingLocations.find((l) => l.name === 'CarePoint Main Branch');
  if (!location) {
    location = await prisma.location.create({
      data: {
        organizationId: organization.id,
        name: 'CarePoint Main Branch',
        addressLine1: '12 Gulshan Avenue',
        addressLine2: 'Level 3',
        city: 'Dhaka',
        stateOrRegion: 'Dhaka',
        postalCode: '1212',
        countryCode: 'BD',
        timezone: 'Asia/Dhaka',
        phone: '+8809600000001',
        isActive: true,
      },
    });
  } else {
    location = await prisma.location.update({
      where: { id: location.id },
      data: {
        addressLine1: '12 Gulshan Avenue',
        addressLine2: 'Level 3',
        city: 'Dhaka',
        stateOrRegion: 'Dhaka',
        postalCode: '1212',
        countryCode: 'BD',
        timezone: 'Asia/Dhaka',
        phone: '+8809600000001',
        isActive: true,
      },
    });
  }

  const serviceDefs = [
    {
      name: 'General Consultation',
      slug: 'general-consultation',
      description: 'Initial general medicine consultation',
      durationMinutes: 30,
    },
    {
      name: 'Follow-up Consultation',
      slug: 'follow-up-consultation',
      description: 'Follow-up visit with a CarePoint doctor',
      durationMinutes: 20,
    },
    {
      name: 'Cardiology Consultation',
      slug: 'cardiology-consultation',
      description: 'Specialist cardiology consultation',
      durationMinutes: 45,
    },
  ];

  const services = [];
  for (const def of serviceDefs) {
    const service = await prisma.service.upsert({
      where: {
        organizationId_slug: {
          organizationId: organization.id,
          slug: def.slug,
        },
      },
      update: {
        name: def.name,
        description: def.description,
        durationMinutes: def.durationMinutes,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
        isActive: true,
      },
      create: {
        organizationId: organization.id,
        name: def.name,
        slug: def.slug,
        description: def.description,
        durationMinutes: def.durationMinutes,
        bufferBeforeMinutes: 0,
        bufferAfterMinutes: 0,
        currency: 'USD',
        isActive: true,
      },
    });
    services.push(service);
  }

  const general = services.find((s) => s.slug === 'general-consultation')!;
  const followUp = services.find((s) => s.slug === 'follow-up-consultation')!;
  const cardio = services.find((s) => s.slug === 'cardiology-consultation')!;

  const providerDefs = [
    {
      name: 'Dr. Sarah Khan',
      providerType: ProviderType.DOCTOR,
      specialty: 'General Medicine',
      serviceIds: [general.id, followUp.id],
    },
    {
      name: 'Dr. Adam Rahman',
      providerType: ProviderType.DOCTOR,
      specialty: 'Cardiology',
      serviceIds: [cardio.id, followUp.id],
    },
  ];

  for (const def of providerDefs) {
    let provider = await prisma.provider.findFirst({
      where: {
        organizationId: organization.id,
        name: def.name,
      },
    });

    if (!provider) {
      provider = await prisma.provider.create({
        data: {
          organizationId: organization.id,
          defaultLocationId: location.id,
          name: def.name,
          providerType: def.providerType,
          specialty: def.specialty,
          timezone: 'Asia/Dhaka',
          isActive: true,
        },
      });
    } else {
      provider = await prisma.provider.update({
        where: { id: provider.id },
        data: {
          defaultLocationId: location.id,
          providerType: def.providerType,
          specialty: def.specialty,
          timezone: 'Asia/Dhaka',
          isActive: true,
        },
      });
    }

    for (const serviceId of def.serviceIds) {
      await prisma.providerService.upsert({
        where: {
          providerId_serviceId: {
            providerId: provider.id,
            serviceId,
          },
        },
        update: { isActive: true },
        create: {
          providerId: provider.id,
          serviceId,
          isActive: true,
        },
      });
    }

    // Replace CarePoint seed-owned rules for this provider only.
    // Application weekday: 0=Sunday … 6=Saturday. Friday(5)/Saturday(6) intentionally have no rules.
    await prisma.availabilityRule.deleteMany({
      where: { providerId: provider.id },
    });

    const windows = [
      { startTime: '09:00', endTime: '13:00' },
      { startTime: '14:00', endTime: '17:00' },
    ];
    const openDays = [0, 1, 2, 3, 4]; // Sunday through Thursday

    for (const dayOfWeek of openDays) {
      for (const window of windows) {
        await prisma.availabilityRule.create({
          data: {
            providerId: provider.id,
            locationId: location.id,
            dayOfWeek,
            startTime: window.startTime,
            endTime: window.endTime,
            timezone: 'Asia/Dhaka',
            isActive: true,
          },
        });
      }
    }
  }

  console.log('Seed completed for CarePoint Clinic');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
