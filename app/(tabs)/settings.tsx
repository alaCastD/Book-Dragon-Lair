import { useSQLiteContext } from 'expo-sqlite';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { addSampleBooks } from '@/src/data/sampleBooks';
import { useColors } from '@/src/components/useColors';

export default function SettingsScreen() {
  const db = useSQLiteContext();
  const colors = useColors();
  const [busy, setBusy] = useState(false);

  const onAddSamples = async () => {
    setBusy(true);
    try {
      const added = await addSampleBooks(db);
      Alert.alert(
        added ? 'Sample books added' : 'Already added',
        added
          ? `${added} sample books are now in your library. You can remove them from each book's page.`
          : 'The sample books are already in your library.',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.section}>
        <Text style={[styles.heading, { color: colors.text }]}>Try it out</Text>
        <Text style={[styles.body, { color: colors.mutedText }]}>
          Add five sample books to see how the library looks before scanning your own.
        </Text>
        <Pressable
          onPress={onAddSamples}
          disabled={busy}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.button,
            { backgroundColor: colors.tint, opacity: pressed || busy ? 0.6 : 1 },
          ]}>
          <Text style={[styles.buttonText, { color: colors.onTint }]}>Add sample books</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={[styles.heading, { color: colors.text }]}>Backup</Text>
        <Text style={[styles.body, { color: colors.mutedText }]}>
          Export and import of your library are coming in step 5.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 28 },
  section: { gap: 8 },
  heading: { fontSize: 17, fontWeight: '700' },
  body: { fontSize: 15, lineHeight: 21 },
  button: { marginTop: 4, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  buttonText: { fontSize: 15, fontWeight: '600' },
});
