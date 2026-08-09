import { FixedClock } from './clock';
import { OrganizationTimeService } from './organization-time.service';
import { RelativeDateService } from './relative-date.service';

describe('RelativeDateService', () => {
  const fixedUtc = new Date('2026-08-08T13:25:00.000Z');
  const prisma = {
    organization: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'org-1',
        name: 'CarePoint Clinic',
        slug: 'carepoint-clinic',
        timezone: 'Asia/Dhaka',
      }),
    },
  };
  const organizationTime = new OrganizationTimeService(
    prisma as never,
    new FixedClock(fixedUtc),
  );
  const service = new RelativeDateService(organizationTime, new FixedClock(fixedUtc));

  async function resolve(expression: string) {
    return service.resolveExpression({
      organizationSlug: 'carepoint-clinic',
      expression,
      allowReferenceOverride: true,
      referenceUtc: fixedUtc.toISOString(),
    });
  }

  it('resolves tomorrow and day after tomorrow in Asia/Dhaka', async () => {
    const tomorrow = await resolve('tomorrow');
    expect(tomorrow).toMatchObject({
      success: true,
      resolvedDate: '2026-08-09',
      dayName: 'Sunday',
    });
    const dayAfter = await resolve('day after tomorrow');
    expect(dayAfter).toMatchObject({
      success: true,
      resolvedDate: '2026-08-10',
      dayName: 'Monday',
    });
  });

  it('resolves this Sunday and next Monday', async () => {
    // Saturday Aug 8 → this Sunday is Aug 9; next Monday is Aug 10
    const thisSunday = await resolve('this Sunday');
    expect(thisSunday).toMatchObject({ success: true, resolvedDate: '2026-08-09' });
    const nextMonday = await resolve('next Monday');
    expect(nextMonday).toMatchObject({ success: true, resolvedDate: '2026-08-10' });
  });

  it('resolves August 10 to the upcoming clinic date', async () => {
    const result = await resolve('August 10');
    expect(result).toMatchObject({
      success: true,
      resolvedDate: '2026-08-10',
    });
  });

  it('keeps explicit ISO dates unchanged', async () => {
    const result = await resolve('2026-08-10');
    expect(result).toMatchObject({ success: true, resolvedDate: '2026-08-10' });
  });

  it('requires clarification for ambiguous expressions', async () => {
    const slash = await resolve('10/08');
    expect(slash).toMatchObject({ success: false, clarificationRequired: true });
    const weekend = await resolve('next weekend');
    expect(weekend).toMatchObject({ success: false, clarificationRequired: true });
  });

  it('rejects past explicit ISO dates for booking', async () => {
    const result = await resolve('2026-08-01');
    expect(result).toMatchObject({
      success: false,
      pastDate: true,
    });
  });

  it('resolves next Sunday after a Saturday reference', async () => {
    const result = await resolve('next Sunday');
    expect(result).toMatchObject({
      success: true,
      resolvedDate: '2026-08-09',
      dayName: 'Sunday',
    });
  });
});
