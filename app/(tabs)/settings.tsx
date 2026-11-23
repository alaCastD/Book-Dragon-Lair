import { useDb } from '@/src/db/DbProvider';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import { countPendingLookups, listBooks } from '@/src/db';
import { addSampleBooks } from '@/src/data/sampleBooks';
import { useColors } from '@/src/components/useColors';
import { requestSync } from '@/src/services/backgroundSync';
import { BackupFormatError, buildBackup, importBackup, parseBackup, toCsv } from '@/src/services/backup';
import { setOnlineAllowed, useOnlineAllowed } from '@/src/services/connection';
import { useSyncStatus } from '@/src/services/syncStatus';
import { readCoverBase64, writeCoverBase64 } from '@/src/services/covers';
import { openTextFile, saveTextFile } from '@/src/services/files';
import { notifyLibraryChanged, onLibraryChanged } from '@/src/services/libraryEvents';
import { showMessage } from '@/src/utils/dialogs';

const today = () => new Date().toISOString().slice(0, 10);

export default function SettingsScreen() {
  const db = useDb();
  const colors = useColors();
  const [busy, setBusy] = useState<string | null>(null);
  const online = useOnlineAllowed();
  const syncStatus = useSyncStatus();
  const [pending, setPending] = useState(0);

  const loadPending = useCallback(() => {
    countPendingLookups(db).then(setPending);
  }, [db]);
  useFocusEffect(loadPending);
  useEffect(() => onLibraryChanged(loadPending), [loadPending]);

  const run = async (label: string, task: () => Promise<void>) => {
    setBusy(label);
    try {
      await task();
    } catch (e) {
      const message = e instanceof BackupFormatError ? e.message : `Something went wrong: ${(e as Error).message}`;
      showMessage('Not done', message);
    } finally {
      setBusy(null);
    }
  };

  const onAddSamples = () =>
    run('samples', async () => {
      const added = await addSampleBooks(db);
      notifyLibraryChanged();
      requestSync(db); // saves their covers to the phone
      showMessage(
        added ? 'Sample books added' : 'Already added',
        added
          ? `${added} sample books are now in your library. You can remove them from each book's page.`
          : 'The sample books are already in your library.',
      );
    });

  const onExportBackup = () =>
    run('backup', async () => {
      const backup = await buildBackup(db, readCoverBase64);
      if (backup.books.length === 0) {
        showMessage('Nothing to back up', 'Your library is empty.');
        return;
      }
      await saveTextFile(
        `book-inventory-backup-${today()}.json`,
        JSON.stringify(backup),
        'application/json',
        'Save your library backup',
      );
    });

  const onExportCsv = () =>
    run('csv', async () => {
      const books = await listBooks(db, { sort: 'title' });
      if (books.length === 0) {
        showMessage('Nothing to export', 'Your library is empty.');
        return;
      }
      await saveTextFile(`book-inventory-${today()}.csv`, toCsv(books), 'text/csv', 'Export your library');
    });

  const onRestore = () =>
    run('restore', async () => {
      const text = await openTextFile();
      if (text === null) return;
      const parsed = parseBackup(text);
      const report = await importBackup(db, parsed, writeCoverBase64);
      notifyLibraryChanged();
      requestSync(db); // re-downloads covers and finishes any pending lookups

      const lines = [`${report.added} ${report.added === 1 ? 'book' : 'books'} added.`];
      if (report.alreadyHad) lines.push(`${report.alreadyHad} already in your library (left unchanged).`);
      if (report.skipped) lines.push(`${report.skipped} damaged ${report.skipped === 1 ? 'entry' : 'entries'} skipped.`);
      if (report.added) lines.push(online ? 'Covers will download when you are online.' : 'Covers will download when you switch to Online.');
      showMessage('Backup restored', lines.join('\n'));
    });

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.container}>
      <Section title="Internet" colors={colors}>
        <View style={styles.switchRow}>
          <Text style={[styles.switchLabel, { color: colors.text }]}>
            {online ? 'Online' : 'Offline'}
          </Text>
          <Switch
            value={online}
            onValueChange={(v) => setOnlineAllowed(db, v)}
            accessibilityLabel="Use the internet"
            trackColor={{ true: colors.online, false: colors.border }}
          />
        </View>
        <Text style={[styles.body, { color: colors.mutedText }]}>
          {online
            ? 'The app looks up scanned books and saves their covers whenever it has a connection.'
            : 'The app won\u2019t use the internet. Scanning, rating and everything else still works; scanned books wait until you switch to Online.'}
        </Text>
        {pending > 0 && (
          <Text style={[styles.note, { color: colors.text }]}>
            {pending} scanned {pending === 1 ? 'book is' : 'books are'} waiting to be looked up
            {online ? '.' : ' \u2014 switch to Online to fill in their details.'}
          </Text>
        )}
        {online && pending > 0 && syncStatus?.problem && (
          <Text style={[styles.note, { color: colors.danger }]}>Last try: {syncStatus.problem}</Text>
        )}
        {online && pending > 0 && (
          <Button label="Look up now" onPress={() => requestSync(db)} busy={false} disabled={!!busy} colors={colors} />
        )}
      </Section>

      <Section title="Backup" colors={colors}>
        <Text style={[styles.body, { color: colors.mutedText }]}>
          {Platform.OS === 'web'
            ? 'On the website, your library is saved only in this browser on this device. Save a backup before clearing browsing data or switching browsers.'
            : 'Your library lives only on this phone. Save a backup somewhere safe (Google Drive, email to yourself) before changing phones or uninstalling the app.'}
        </Text>
        <Button label="Save a backup" onPress={onExportBackup} busy={busy === 'backup'} disabled={!!busy} colors={colors} primary />
        <Button label="Restore from a backup" onPress={onRestore} busy={busy === 'restore'} disabled={!!busy} colors={colors} />
        <Text style={[styles.note, { color: colors.mutedText }]}>
          Restoring adds the backup&apos;s books to this library. Books you already have are left as they are.
        </Text>
      </Section>

      <Section title="Spreadsheet" colors={colors}>
        <Text style={[styles.body, { color: colors.mutedText }]}>
          Export your library as a CSV file to open in Google Sheets or Excel. This can&apos;t be
          restored. Use a backup for that.
        </Text>
        <Button label="Export spreadsheet" onPress={onExportCsv} busy={busy === 'csv'} disabled={!!busy} colors={colors} />
      </Section>

      <Section title="Try it out" colors={colors}>
        <Text style={[styles.body, { color: colors.mutedText }]}>
          Add five sample books to see how the library looks.
        </Text>
        <Button label="Add sample books" onPress={onAddSamples} busy={busy === 'samples'} disabled={!!busy} colors={colors} />
      </Section>
    </ScrollView>
  );
}

type Colors = ReturnType<typeof useColors>;

function Section({ title, colors, children }: { title: string; colors: Colors; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={[styles.heading, { color: colors.text }]}>{title}</Text>
      {children}
    </View>
  );
}

function Button({
  label,
  onPress,
  busy,
  disabled,
  colors,
  primary,
}: {
  label: string;
  onPress: () => void;
  busy: boolean;
  disabled: boolean;
  colors: Colors;
  primary?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ busy, disabled }}
      style={({ pressed }) => [
        styles.button,
        primary
          ? { backgroundColor: colors.tint }
          : { borderWidth: 1, borderColor: colors.tint },
        { opacity: pressed || disabled ? 0.6 : 1 },
      ]}>
      <Text style={[styles.buttonText, { color: primary ? colors.onTint : colors.tint }]}>
        {busy ? 'Working…' : label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, gap: 32, paddingBottom: 48 },
  section: { gap: 10 },
  heading: { fontSize: 17, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 21 },
  note: { fontSize: 13, lineHeight: 18 },
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  switchLabel: { fontSize: 16, fontWeight: '600' },
  button: { borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  buttonText: { fontSize: 15, fontWeight: '600' },
});
