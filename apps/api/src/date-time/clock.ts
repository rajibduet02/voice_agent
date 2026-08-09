export const CLOCK = Symbol('CLOCK');

export interface Clock {
  /** Current UTC instant from the system clock (or a test double). */
  now(): Date;
}

export class SystemClock implements Clock {
  now(): Date {
    return new Date();
  }
}

export class FixedClock implements Clock {
  constructor(private readonly instant: Date) {}

  now(): Date {
    return new Date(this.instant.getTime());
  }
}
