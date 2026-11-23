// The bookish background patterns the user can choose from in Settings.
// Drawings live in assets/backgrounds/src/*.svg (rendered to PNG by
// scripts/render-backgrounds.js).
export const BACKGROUNDS = [
  { name: 'doodles', label: 'Book doodles', tile: require('@/assets/backgrounds/doodles.png') },
  { name: 'shelves', label: 'Bookshelf', tile: require('@/assets/backgrounds/shelves.png') },
  { name: 'pages', label: 'Notebook pages', tile: require('@/assets/backgrounds/pages.png') },
] as const;

export type BackgroundName = (typeof BACKGROUNDS)[number]['name'];

export const DEFAULT_BACKGROUND: BackgroundName = 'doodles';

export function isBackgroundName(v: unknown): v is BackgroundName {
  return BACKGROUNDS.some((b) => b.name === v);
}

export function tileFor(name: BackgroundName) {
  return (BACKGROUNDS.find((b) => b.name === name) ?? BACKGROUNDS[0]).tile;
}
