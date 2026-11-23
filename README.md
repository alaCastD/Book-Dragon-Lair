# Book-Dragon-Liar

An Android app to catalog the books you own. Scan a book's barcode to add that exact edition with its cover, mark it **Read** or **To Be Read**, and rate it out of 5 stars. Your library is stored on the phone, so it works without internet and keeps your data between uses.

Built with React Native + Expo (SDK 58), Expo Router and SQLite (`expo-sqlite`).

## Status

| Step | | |
|---|---|---|
| 1 | Project setup and on-device database | ✅ Done |
| 2 | Library grid (search, filter, sort) and book page (status, star rating, notes) | ✅ Done |
| 3 | Barcode scanner (works offline), typed-ISBN fallback, duplicate detection | ✅ Done |
| 4 | Online lookup of title/edition/cover, offline "pending" queue, covers saved to the phone | ✅ Done |
| 5 | Manual entry, editing, backup export/import | Planned |

Scanned books are saved immediately, even with no connection, and show as **Pending** until the phone is online. The app then looks up the exact edition by its ISBN, using [Open Library](https://openlibrary.org) first and [Google Books](https://books.google.com) to fill any gaps (both free, no account needed). It also downloads the cover to the phone, so covers show offline. This happens on its own when the app opens or the connection comes back. Your ratings, Read status and notes are never overwritten. **Settings → Add sample books** adds five books to try the library out.

## Getting the app on your phone

Every push to `main` builds an installable APK with GitHub Actions (`.github/workflows/android-apk.yml`). No Expo account needed.

1. On GitHub, open the **Actions** tab → the latest **Build Android APK** run.
2. Under **Artifacts**, download `book-inventory-apk` (a zip) and unzip it to get `app-release.apk`.
3. Copy it to your phone and open it. Android will ask you to allow installing apps from that source.

To update, install the newer APK over the old one; your library is kept.

> The APK is signed with Android's standard debug key, which is fine for installing on your own phone but not for the Play Store. If you ever reinstall from a build signed with a different key, Android will require uninstalling first, **which deletes the library**; use the backup export (step 5) before doing that.

## Development

Requires Node 22. Install dependencies:

```bash
npm install
```

Run the checks (the same ones CI runs):

```bash
npm run typecheck && npm run lint && npm test
```

To run on a connected Android phone or emulator with live reload (needs Android Studio / the Android SDK):

```bash
npm run android
```

## Project layout

```
app/                     Screens (Expo Router: each file is a route)
  (tabs)/index.tsx       Library
  (tabs)/scan.tsx        Barcode scanner
  (tabs)/settings.tsx    Settings
  book/[id].tsx          Book page
src/
  db/                    SQLite schema, migrations and queries
  services/              ISBN validation, scanning, book lookup, cover saving, background sync
  components/            Cover, star rating, book tile, segmented control
  data/sampleBooks.ts    Sample books for trying the app
  utils/                 Small helpers
  types.ts               Book type
```

Schema changes go in `src/db/migrations.ts` as a new entry at the end of the list. Never edit a shipped migration, or existing libraries on phones won't upgrade correctly.
