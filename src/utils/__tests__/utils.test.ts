/// <reference types="jest" />
import { countsSummary, coverUri, shortDate } from '../format';
import { nextRating, ratingLabel } from '../rating';

describe('nextRating', () => {
  it('sets the tapped star', () => {
    expect(nextRating(0, 4)).toBe(4);
    expect(nextRating(4, 2)).toBe(2);
  });
  it('clears the rating when the current star is tapped again', () => {
    expect(nextRating(3, 3)).toBe(0);
  });
});

describe('ratingLabel', () => {
  it('describes the rating', () => {
    expect(ratingLabel(0)).toBe('Not rated');
    expect(ratingLabel(4)).toBe('4 out of 5 stars');
  });
});

describe('coverUri', () => {
  it('prefers the copy saved on the phone', () => {
    expect(coverUri({ coverLocalUri: 'file:///a.jpg', coverRemoteUrl: 'https://x/a.jpg' })).toBe(
      'file:///a.jpg',
    );
    expect(coverUri({ coverLocalUri: null, coverRemoteUrl: 'https://x/a.jpg' })).toBe('https://x/a.jpg');
    expect(coverUri({ coverLocalUri: null, coverRemoteUrl: null })).toBeNull();
  });
});

describe('countsSummary', () => {
  it('summarizes the library', () => {
    expect(countsSummary({ total: 0, read: 0, toRead: 0 })).toBe('No books yet');
    expect(countsSummary({ total: 1, read: 0, toRead: 1 })).toBe('1 book · 0 read · 1 to be read');
    expect(countsSummary({ total: 12, read: 5, toRead: 7 })).toBe('12 books · 5 read · 7 to be read');
  });
});

describe('shortDate', () => {
  it('formats valid dates and ignores missing or bad ones', () => {
    expect(shortDate('2026-11-23T12:00:00.000Z')).toMatch(/2026/);
    expect(shortDate(null)).toBeNull();
    expect(shortDate('not a date')).toBeNull();
  });
});
