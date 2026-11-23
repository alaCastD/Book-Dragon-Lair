import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { router, useFocusEffect } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useColors } from '@/src/components/useColors';
import { addScannedIsbn, type ScanOutcome } from '@/src/services/addScanned';
import { requestSync } from '@/src/services/backgroundSync';
import { formatIsbn } from '@/src/services/isbn';

/** Ignore the same barcode for this long, so holding the camera on a book doesn't repeat. */
const SAME_CODE_COOLDOWN_MS = 3000;

interface Banner {
  tone: 'success' | 'info' | 'error';
  message: string;
  bookId?: number;
}

function bannerFor(outcome: ScanOutcome): Banner {
  switch (outcome.kind) {
    case 'added':
      return {
        tone: 'success',
        message: `Added ${formatIsbn(outcome.book.isbn!)}. Looking up its details…`,
        bookId: outcome.book.id,
      };
    case 'duplicate':
      return {
        tone: 'info',
        message: `Already in your library: ${outcome.book.title}`,
        bookId: outcome.book.id,
      };
    case 'not-a-book':
      return {
        tone: 'error',
        message: "That barcode isn't a book ISBN. Look for the barcode starting with 978 or 979.",
      };
    case 'invalid':
      return { tone: 'error', message: "That doesn't look like a valid ISBN. Try again." };
  }
}

export default function ScanScreen() {
  const db = useSQLiteContext();
  const colors = useColors();
  const [permission, requestPermission] = useCameraPermissions();

  // The camera only runs while this tab is on screen.
  const [focused, setFocused] = useState(false);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  const [banner, setBanner] = useState<Banner | null>(null);
  const [addedCount, setAddedCount] = useState(0);
  const [typing, setTyping] = useState(false);
  const [typed, setTyped] = useState('');

  const busy = useRef(false);
  const lastCode = useRef<{ data: string; at: number } | null>(null);

  const handleCode = useCallback(
    async (data: string) => {
      if (busy.current) return;
      busy.current = true;
      try {
        const outcome = await addScannedIsbn(db, data);
        if (outcome.kind === 'added') {
          setAddedCount((n) => n + 1);
          requestSync(db); // look it up now if online; otherwise it waits

          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        } else if (outcome.kind === 'duplicate') {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        } else {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        }
        setBanner(bannerFor(outcome));
        return outcome;
      } catch (e) {
        setBanner({ tone: 'error', message: `Couldn't save that book: ${(e as Error).message}` });
      } finally {
        busy.current = false;
      }
    },
    [db],
  );

  const onBarcodeScanned = useCallback(
    ({ data }: BarcodeScanningResult) => {
      const now = Date.now();
      const last = lastCode.current;
      if (last && last.data === data && now - last.at < SAME_CODE_COOLDOWN_MS) return;
      lastCode.current = { data, at: now };
      handleCode(data);
    },
    [handleCode],
  );

  const submitTyped = async () => {
    const outcome = await handleCode(typed);
    if (outcome && (outcome.kind === 'added' || outcome.kind === 'duplicate')) {
      setTyped('');
      setTyping(false);
    }
  };

  if (!permission) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Text style={[styles.permTitle, { color: colors.text }]}>Camera access needed</Text>
        <Text style={[styles.permText, { color: colors.mutedText }]}>
          The camera is used only to read book barcodes. Nothing is recorded or uploaded.
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => (permission.canAskAgain ? requestPermission() : Linking.openSettings())}
          style={({ pressed }) => [styles.primary, { backgroundColor: colors.tint, opacity: pressed ? 0.7 : 1 }]}>
          <Text style={[styles.primaryText, { color: colors.onTint }]}>
            {permission.canAskAgain ? 'Allow camera' : 'Open phone settings'}
          </Text>
        </Pressable>
      </View>
    );
  }

  const bannerColor =
    banner?.tone === 'success' ? '#1b5e20' : banner?.tone === 'info' ? '#0d47a1' : '#b71c1c';

  return (
    <KeyboardAvoidingView style={styles.container} behavior="padding">
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        active={focused}
        barcodeScannerSettings={{ barcodeTypes: ['ean13', 'upc_a', 'ean8'] }}
        onBarcodeScanned={focused && !typing ? onBarcodeScanned : undefined}
      />

      <View style={styles.overlay} pointerEvents="box-none">
        <Text style={styles.hint}>
          Point the camera at the barcode on the back of the book
        </Text>
        <View style={styles.frame} pointerEvents="none" />
        {addedCount > 0 && (
          <Text style={styles.counter}>
            {addedCount} {addedCount === 1 ? 'book' : 'books'} added this session
          </Text>
        )}
      </View>

      <View style={styles.bottom}>
        {banner && (
          <View style={[styles.banner, { backgroundColor: bannerColor }]} accessibilityLiveRegion="polite">
            <Text style={styles.bannerText}>{banner.message}</Text>
            {banner.bookId !== undefined && (
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  router.push({ pathname: '/book/[id]', params: { id: String(banner.bookId) } })
                }
                hitSlop={8}>
                <Text style={styles.bannerAction}>View</Text>
              </Pressable>
            )}
          </View>
        )}

        {typing ? (
          <View style={[styles.typeRow, { backgroundColor: colors.background }]}>
            <TextInput
              value={typed}
              onChangeText={setTyped}
              placeholder="Type the ISBN (10 or 13 digits)"
              placeholderTextColor={colors.mutedText}
              keyboardType="number-pad"
              autoFocus
              onSubmitEditing={submitTyped}
              returnKeyType="done"
              style={[styles.typeInput, { color: colors.text, borderColor: colors.border }]}
              accessibilityLabel="ISBN"
            />
            <Pressable
              accessibilityRole="button"
              onPress={submitTyped}
              style={[styles.smallButton, { backgroundColor: colors.tint }]}>
              <Text style={{ color: colors.onTint, fontWeight: '600' }}>Add</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => setTyping(false)} style={styles.smallButton}>
              <Text style={{ color: colors.text }}>Cancel</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            accessibilityRole="button"
            onPress={() => setTyping(true)}
            style={({ pressed }) => [styles.typeLink, { opacity: pressed ? 0.6 : 1 }]}>
            <Text style={styles.typeLinkText}>Barcode won&apos;t scan? Type the ISBN</Text>
          </Pressable>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
  permTitle: { fontSize: 18, fontWeight: '700' },
  permText: { fontSize: 15, textAlign: 'center', lineHeight: 21 },
  primary: { marginTop: 8, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 24 },
  primaryText: { fontSize: 15, fontWeight: '600' },
  overlay: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  hint: {
    color: '#fff',
    fontSize: 15,
    textAlign: 'center',
    textShadowColor: '#000',
    textShadowRadius: 4,
  },
  frame: {
    width: '85%',
    aspectRatio: 2.2,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.9)',
    borderRadius: 12,
  },
  counter: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: 'hidden',
  },
  bottom: { padding: 12, gap: 10 },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 10,
    padding: 12,
  },
  bannerText: { flex: 1, color: '#fff', fontSize: 14, lineHeight: 19 },
  bannerAction: { color: '#fff', fontWeight: '700', fontSize: 15, textDecorationLine: 'underline' },
  typeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 10, padding: 8 },
  typeInput: {
    flex: 1,
    height: 42,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 16,
  },
  smallButton: { paddingHorizontal: 12, paddingVertical: 10, borderRadius: 8 },
  typeLink: { alignSelf: 'center', padding: 8 },
  typeLinkText: {
    color: '#fff',
    fontSize: 14,
    textDecorationLine: 'underline',
    textShadowColor: '#000',
    textShadowRadius: 4,
  },
});
