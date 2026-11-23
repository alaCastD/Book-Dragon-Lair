/// <reference types="jest" />
import { getSetting, migrate, setSetting } from '../../db';
import { createTestDb } from '../../db/__tests__/nodeSqliteDb';
import { BACKGROUNDS, DEFAULT_BACKGROUND, isBackgroundName } from '../../components/backgrounds';
import { getBackground, loadBackgroundSetting, setBackground } from '../appearance';

jest.mock('@/assets/backgrounds/doodles.png', () => 1, { virtual: true });
jest.mock('@/assets/backgrounds/shelves.png', () => 2, { virtual: true });
jest.mock('@/assets/backgrounds/pages.png', () => 3, { virtual: true });

let db: ReturnType<typeof createTestDb>;
beforeEach(async () => {
  db = createTestDb();
  await migrate(db);
});
afterEach(() => db.close());

it('offers the three backgrounds, defaulting to book doodles', async () => {
  expect(BACKGROUNDS.map((b) => b.name)).toEqual(['doodles', 'shelves', 'pages']);
  expect(await loadBackgroundSetting(db)).toBe(DEFAULT_BACKGROUND);
  expect(DEFAULT_BACKGROUND).toBe('doodles');
});

it('saves the choice and restores it next time the app opens', async () => {
  await setBackground(db, 'shelves');
  expect(await getSetting(db, 'background')).toBe('shelves');
  await setBackground(db, 'pages'); // in memory…
  await setSetting(db, 'background', 'shelves');
  expect(await loadBackgroundSetting(db)).toBe('shelves'); // …the saved value wins on start
  expect(getBackground()).toBe('shelves');
});

it('ignores an unknown saved value', async () => {
  await setSetting(db, 'background', 'neon-glitter');
  expect(await loadBackgroundSetting(db)).toBe('doodles');
  expect(isBackgroundName('neon-glitter')).toBe(false);
});
