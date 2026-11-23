/// <reference types="jest" />
import { shortDate } from '../format';
import {
  finishedDateProblem,
  finishedIso,
  fromDateInputValue,
  pickerDate,
  toDateInputValue,
} from '../finishedDate';

describe('finished dates', () => {
  it('stores the chosen day at local noon, so it shows as the same day', () => {
    const iso = finishedIso(new Date(2024, 2, 9, 23, 59)); // 9 Mar 2024, late evening
    const back = new Date(iso);
    expect([back.getFullYear(), back.getMonth(), back.getDate(), back.getHours()]).toEqual([2024, 2, 9, 12]);
    expect(shortDate(iso)).toMatch(/9/);
  });

  it('opens the picker on the saved day, or today', () => {
    const now = new Date(2026, 10, 23, 8);
    expect(pickerDate(null, now)).toBe(now);
    expect(pickerDate('garbage', now)).toBe(now);
    expect(pickerDate(finishedIso(new Date(2020, 0, 5)), now).getDate()).toBe(5);
  });

  it('converts to and from the browser date input format', () => {
    expect(toDateInputValue(new Date(2024, 0, 5))).toBe('2024-01-05');
    const d = fromDateInputValue('2024-02-29')!;
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2024, 1, 29]);
    expect(fromDateInputValue('2023-02-29')).toBeNull(); // not a real day
    expect(fromDateInputValue('')).toBeNull();
  });

  it('refuses future dates and the distant past', () => {
    const now = new Date(2026, 10, 23, 9);
    expect(finishedDateProblem(new Date(2026, 10, 23, 12), now)).toBeNull(); // today is fine
    expect(finishedDateProblem(new Date(2026, 10, 24, 12), now)).toMatch(/future/);
    expect(finishedDateProblem(new Date(1850, 0, 1), now)).toMatch(/1900/);
    expect(finishedDateProblem(new Date(1999, 5, 1), now)).toBeNull();
  });
});
