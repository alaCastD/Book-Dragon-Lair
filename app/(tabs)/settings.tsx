import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { listBooks } from '@/src/db';
import { addSampleBooks } from '@/src/data/sampleBooks';
import { useColors } from '@/src/components/useColors';
import { requestSync } from '@/src/services/backgroundSync';
import { BackupFormatError, buildBackup, importBackup, parseBackup, toCsv } from '@/src/services/backup';
import { readCoverBase64, writeCoverBase64 } from '@/src/services/covers';
import { notifyLibraryChanged } from '@/src/services/libraryEvents';

const today = () => new Date().toISOString().slice(0, 10);

/** Writes text to a temporary file and opens the share sheet (Drive, email, Files…). */
async function shareText(name: string, text: string, mimeType: string, dialogTitle: string) {
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true });
  await file.write(text);
  await Sharing.shareAsync(file.uri, { mimeType, dialogTitle });
}

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const colors = useColors();
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (label: string, task: () => Promise<void>) => {
    setBusy(label);
    try {
      await task();
    } catch (e) {
      const message = e instanceof BackupFormatError ? e.message : `Something went wrong: ${(e as Error).message}`;
      Alert.alert('Not done', message);
    } finally {
      setBusy(null);
    }
  };

  const onAddSamples = () =>
    run('samples', async () => {
      const added = await addSampleBooks(db);
      notifyLibraryChanged();
      requestSync(db); // saves their covers to the phone
      Alert.alert(
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
        Alert.alert('Nothing to back up', 'Your library is empty.');
        return;
      }
      await shareText(
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
        Alert.alert('Nothing to export', 'Your library is empty.');
        return;
      }
      await shareText(`book-inventory-${today()}.csv`, toCsv(books), 'text/csv', 'Export your library');
    });

  const onRestore = () =>
    run('restore', async () => {
      const picked = await File.pickFileAsync({ mimeTypes: ['application/json', 'application/octet-stream', '*/*'] });
      if (picked.canceled) return;
      const parsed = parseBackup(await picked.result.text());
      const report = await importBackup(db, parsed, writeCoverBase64);
      notifyLibraryChanged();
      requestSync(db); // re-downloads covers and finishes any pending lookups

      const lines = [`${report.added} ${report.added === 1 ? 'book' : 'books'} added.`];
      if (report.alreadyHad) lines.push(`${report.alreadyHad} already in your library (left unchanged).`);
      if (report.skipped) lines.push(`${report.skipped} damaged ${report.skipped === 1 ? 'entry' : 'entries'} skipped.`);
      if (report.added) lines.push('Covers will download when you are online.');
      Alert.alert('Backup restored', lines.join('\n'));
    });

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.container}>
      <Section title="Backup" colors={colors}>
        <Text style={[styles.body, { color: colors.mutedText }]}>
          Your library lives only on this phone. Save a backup somewhere safe (Google Drive, email to
          yourself) before changing phones or uninstalling the app.
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
  button: { borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  buttonText: { fontSize: 15, fontWeight: '600' },
});
