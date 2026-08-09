import {
  matchesTimePreferenceHour,
  normalizeTimePreference,
} from './time-preference.util';

describe('time-preference.util', () => {
  it('normalizes aliases', () => {
    expect(normalizeTimePreference('before noon')).toBe('morning');
    expect(normalizeTimePreference('after lunch')).toBe('afternoon');
    expect(normalizeTimePreference('late afternoon')).toBe('evening');
    expect(normalizeTimePreference('anytime')).toBe('any');
    expect(normalizeTimePreference('no preference')).toBe('any');
    expect(normalizeTimePreference('whenever')).toBe('any');
  });

  it('matches CarePoint hour windows', () => {
    expect(matchesTimePreferenceHour(9, 'morning')).toBe(true);
    expect(matchesTimePreferenceHour(12, 'morning')).toBe(false);
    expect(matchesTimePreferenceHour(12, 'afternoon')).toBe(true);
    expect(matchesTimePreferenceHour(16, 'afternoon')).toBe(true);
    expect(matchesTimePreferenceHour(17, 'evening')).toBe(true);
    expect(matchesTimePreferenceHour(9, 'any')).toBe(true);
  });
});
