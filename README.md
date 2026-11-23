# Book-Dragon-Lair

An Android app to catalog the books you own. Scan a book's barcode to add that exact edition with its cover, mark it **Read** or **To Be Read**, and rate it out of 5 stars. Your library is stored on the phone, so it works without internet and keeps your data between uses.

Built with React Native + Expo (SDK 58), Expo Router and SQLite (`expo-sqlite`).

## Status

| Step | | |
|---|---|---|
| 1 | Project setup and on-device database | ✅ Done |
| 2 | Library grid (search, filter, sort) and book page (status, star rating, notes) | ✅ Done |
| 3 | Barcode scanner (works offline), typed-ISBN fallback, duplicate detection | ✅ Done |
| 4 | Online lookup of title/edition/cover, offline "pending" queue, covers saved to the phone | ✅ Done |
| 5 | Add books by hand, edit details, cover photos, backup and restore, spreadsheet export | ✅ Done |

Scanned books are saved immediately, even with no connection, and show as **Pending** until the phone is online. The app then looks up the exact edition by its ISBN, using [Open Library](https://openlibrary.org) first and [Google Books](https://books.google.com) to fill any gaps (both free, no account needed). It also downloads the cover to the phone, so covers show offline. This happens on its own when the app opens or the connection comes back. Your ratings, Read status and notes are never overwritten. **Settings → Add sample books** adds five books to try the library out.

**Online / Offline switch.** The pill at the top of the Library and Scan tabs (also in **Settings → Internet**) decides whether the app may use the internet. While **Offline**, the app makes no requests at all: no lookups, no cover downloads, and covers aren't loaded from the web. Scanned books wait as *Pending* until you switch to **Online**, which starts the lookups straight away. The choice is remembered. Default: Online.

Books without a barcode can be added with **+ Add** on the Library tab, and any book can be corrected with **Edit** on its page, including taking or choosing a photo for its cover.

## Website version

The same app runs in a browser at **https://alacastd.github.io/Book-Dragon-Lair/**. It's published automatically by `.github/workflows/web-pages.yml` on every push to `main`.

- The website keeps its library **in that browser on that device**. It's separate from the phone app and from other browsers, and clearing browsing data erases it. Use **Settings → Save a backup** to move books between them (restore the file on the other side).
- Barcode scanning needs a browser with camera access and barcode support (e.g. Chrome on Android). Typing the ISBN works everywhere.
- Google Books often refuses requests from apps without an API key ("too many requests"). The app then relies on Open Library; a book Open Library doesn't have is marked **Not found** (fix the ISBN with Edit, or type the details in) rather than waiting forever.
- Downloaded covers aren't stored offline on the website; the browser shows them from Open Library / Google Books.
- Under the hood, the website uses SQLite compiled to WebAssembly (sql.js), saved to the browser's IndexedDB storage, because expo-sqlite's web build needs server headers GitHub Pages can't send. Platform-specific code lives in `*.web.ts(x)` files next to the phone versions.

To try the website locally:

```bash
npm run web
```

## Backing up your library

Your library is stored only on your phone. In **Settings**:

- **Save a backup** creates one `.json` file with every book, rating, note and date, plus any cover photos you took. Save it to Google Drive, email it to yourself, etc.
- **Restore from a backup** adds the books from a backup file. Books already in the library are left unchanged, so restoring twice is safe. Downloaded covers are fetched again when online.
- **Export spreadsheet** creates a `.csv` file for Google Sheets or Excel. It's for viewing only and can't be restored.

## Getting the app on your phone

Every push to `main` builds an installable APK with GitHub Actions (`.github/workflows/android-apk.yml`). No Expo account needed.

1. On GitHub, open the **Actions** tab → the latest **Build Android APK** run.
2. Under **Artifacts**, download `book-inventory-apk` (a zip) and unzip it to get `app-release.apk`.
3. Copy it to your phone and open it. Android will ask you to allow installing apps from that source.

To update, install the newer APK over the old one; your library is kept.

The APK is built for 64-bit ARM phones (`arm64-v8a`), which covers practically every Android phone from about 2017 onward. It won't install on an x86 emulator.

> The APK is signed with Android's standard debug key, which is fine for installing on your own phone but not for the Play Store. If you ever install a build signed with a different key, Android will require uninstalling first, **which deletes the library**. Save a backup (Settings → Save a backup) before doing that.

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
  edit-book.tsx          Add a book by hand / edit a book
  (tabs)/index.tsx       Library
  (tabs)/scan.tsx        Barcode scanner
  (tabs)/settings.tsx    Settings
  book/[id].tsx          Book page
src/
  db/                    SQLite schema, migrations, queries; DbProvider (phone) / DbProvider.web (browser)
  services/              ISBN validation, scanning, book lookup, covers, background sync,
                         add/edit form rules, backup/restore and CSV export
  components/            Cover, star rating, book tile, segmented control
  data/sampleBooks.ts    Sample books for trying the app
  utils/                 Small helpers
  types.ts               Book type
```

Schema changes go in `src/db/migrations.ts` as a new entry at the end of the list. Never edit a shipped migration, or existing libraries on phones won't upgrade correctly.
