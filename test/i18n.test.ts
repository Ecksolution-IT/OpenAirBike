import { describe, expect, it } from 'vitest';
import { createI18n, detectLanguage } from '../src/ui/i18n';

describe('language detection (decision D2: default German)', () => {
  it('prefers German, uses English only when the browser prefers it', () => {
    expect(detectLanguage([])).toBe('de');
    expect(detectLanguage(['de-DE', 'en-US'])).toBe('de');
    expect(detectLanguage(['de-AT'])).toBe('de');
    expect(detectLanguage(['en-US', 'de'])).toBe('en');
    expect(detectLanguage(['fr-FR', 'en-GB'])).toBe('en');
    expect(detectLanguage(['fr-FR'])).toBe('de');
  });
});

describe('formatters', () => {
  const { fmt, t } = createI18n('de', 'de-DE', 'Europe/Berlin');

  it('formats numbers with a decimal comma and without thousands separators', () => {
    expect(fmt.number(24.64, 1)).toBe('24,6');
    expect(fmt.number(427.6)).toBe('428');
    expect(fmt.number(1234)).toBe('1234');
    expect(fmt.number(undefined)).toBe('--');
    expect(fmt.number(Number.NaN)).toBe('--');
  });

  it('formats distances in m below 1 km, otherwise km', () => {
    expect(fmt.distance(850)).toEqual({ value: '850', unit: 'm' });
    expect(fmt.distance(8400)).toEqual({ value: '8,40', unit: 'km' });
    expect(fmt.distance(123_456)).toEqual({ value: '123,5', unit: 'km' });
    expect(fmt.distance(undefined)).toEqual({ value: '--', unit: 'km' });
  });

  it('formats durations, dates and 24-hour times', () => {
    expect(fmt.duration(0)).toBe('00:00');
    expect(fmt.duration(1458)).toBe('24:18');
    expect(fmt.duration(3725)).toBe('1:02:05');
    expect(fmt.duration(undefined)).toBe('--');
    // 2026-09-26 17:13 UTC = 19:13 in Berlin (CEST)
    expect(fmt.date('2026-09-26T17:13:00.000Z')).toBe('26.09.2026');
    expect(fmt.time('2026-09-26T17:13:00.000Z')).toBe('19:13');
    expect(fmt.dateTime('2026-09-26T17:13:00.000Z')).toBe('26.09.2026 19:13');
  });

  it('has German texts with parameters', () => {
    expect(t.startWorkout).toBe('Training starten');
    expect(t.unit.cadence).toBe('U/MIN');
    expect(t.unfinishedFound('26.09.2026 19:13')).toContain('26.09.2026 19:13');
  });

  it('provides the same keys in English', () => {
    const en = createI18n('en').t;
    const keys = (o: object): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? keys(v).map((c) => `${k}.${c}`) : [k]));
    expect(keys(en)).toEqual(keys(t));
    expect(en.startWorkout).toBe('Start workout');
  });
});
