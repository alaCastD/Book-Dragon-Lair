import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useSQLiteContext } from 'expo-sqlite';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { deleteBook, getBook, updateBook } from '@/src/db';
import { BookCover } from '@/src/components/BookCover';
import { SegmentedControl } from '@/src/components/SegmentedControl';
import { StarRating } from '@/src/components/StarRating';
import { useColors } from '@/src/components/useColors';
import type { Book, BookUpdate, ReadStatus } from '@/src/types';
import { shortDate } from '@/src/utils/format';

const STATUS_OPTIONS = [
  { value: 'to_read', label: 'To Be Read' },
  { value: 'read', label: 'Read' },
] as const;

export default function BookDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const bookId = Number(id);
  const db = useSQLiteContext();
  const colors = useColors();

  // undefined = still loading, null = not found
  const [book, setBook] = useState<Book | null | undefined>(undefined);
  const [notes, setNotes] = useState('');
  // What's saved in the database, and what's typed, kept in refs so unsaved
  // notes can still be saved when leaving the screen.
  const savedNotes = useRef<string | null>(null);
  const typedNotes = useRef('');

  useEffect(() => {
    getBook(db, bookId).then((b) => {
      setBook(b);
      setNotes(b?.notes ?? '');
      savedNotes.current = b?.notes ?? null;
      typedNotes.current = b?.notes ?? '';
    });
  }, [db, bookId]);

  const save = useCallback(
    async (changes: BookUpdate) => {
      // Show the change immediately, then save it to the phone.
      setBook((b) => (b ? { ...b, ...changes } : b));
      const saved = await updateBook(db, bookId, changes);
      if (saved) setBook(saved);
    },
    [db, bookId],
  );

  const saveNotes = useCallback(() => {
    const value = typedNotes.current.trim() || null;
    if (value === savedNotes.current) return;
    savedNotes.current = value;
    updateBook(db, bookId, { notes: value });
  }, [db, bookId]);

  // Save notes if the user leaves the screen while still typing.
  useEffect(() => saveNotes, [saveNotes]);

  const confirmDelete = () => {
    if (!book) return;
    Alert.alert('Remove this book?', `"${book.title}" will be removed from your library.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          savedNotes.current = typedNotes.current.trim() || null; // nothing left to save
          await deleteBook(db, bookId);
          router.back();
        },
      },
    ]);
  };

  if (book === undefined) return <View style={{ flex: 1, backgroundColor: colors.background }} />;

  if (book === null) {
    return (
      <View style={[styles.center, { backgroundColor: colors.background }]}>
        <Stack.Screen options={{ title: 'Not found' }} />
        <Text style={{ color: colors.text, fontSize: 16 }}>This book is no longer in your library.</Text>
      </View>
    );
  }

  const details: [string, string | null][] = [
    ['Author', book.authors],
    ['Publisher', book.publisher],
    ['Published', book.publishDate],
    ['Edition', book.edition],
    ['Format', book.format],
    ['Pages', book.pageCount ? String(book.pageCount) : null],
    ['ISBN', book.isbn],
    ['Added', shortDate(book.dateAdded)],
    ['Finished', book.status === 'read' ? shortDate(book.dateRead) : null],
  ];

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: book.title }} />

      <View style={styles.top}>
        <BookCover book={book} style={styles.cover} fallbackFontSize={16} />
        <View style={styles.titleBlock}>
          <Text style={[styles.title, { color: colors.text }]}>{book.title}</Text>
          {book.subtitle ? (
            <Text style={[styles.subtitle, { color: colors.mutedText }]}>{book.subtitle}</Text>
          ) : null}
          {book.authors ? (
            <Text style={[styles.authors, { color: colors.text }]}>{book.authors}</Text>
          ) : null}
        </View>
      </View>

      {book.lookupState === 'pending' && (
        <View style={[styles.notice, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={{ color: colors.text, fontSize: 14, lineHeight: 20 }}>
            This book was scanned and saved. Its title, author, edition and cover will be filled in
            automatically the next time your phone is online.
          </Text>
        </View>
      )}

      <Section title="Status" colors={colors}>
        <SegmentedControl
          options={STATUS_OPTIONS}
          value={book.status}
          onChange={(status: ReadStatus) => save({ status })}
        />
      </Section>

      <Section title="Your rating" colors={colors}>
        <StarRating rating={book.rating} onChange={(rating) => save({ rating })} size={36} />
        <Text style={[styles.hint, { color: colors.mutedText }]}>
          {book.rating === 0 ? 'Tap a star to rate.' : 'Tap the same star again to clear.'}
        </Text>
      </Section>

      <Section title="Details" colors={colors}>
        {details
          .filter(([, v]) => v)
          .map(([label, value]) => (
            <View key={label} style={[styles.detailRow, { borderColor: colors.border }]}>
              <Text style={[styles.detailLabel, { color: colors.mutedText }]}>{label}</Text>
              <Text style={[styles.detailValue, { color: colors.text }]}>{value}</Text>
            </View>
          ))}
      </Section>

      <Section title="Notes" colors={colors}>
        <TextInput
          value={notes}
          onChangeText={(text) => {
            setNotes(text);
            typedNotes.current = text;
          }}
          onBlur={saveNotes}
          placeholder="Your thoughts, who lent it to you, where it's shelved…"
          placeholderTextColor={colors.mutedText}
          multiline
          style={[styles.notes, { color: colors.text, backgroundColor: colors.card, borderColor: colors.border }]}
          accessibilityLabel="Notes"
        />
      </Section>

      <Pressable
        onPress={confirmDelete}
        accessibilityRole="button"
        style={({ pressed }) => [styles.delete, { borderColor: colors.danger, opacity: pressed ? 0.6 : 1 }]}>
        <Text style={{ color: colors.danger, fontWeight: '600', fontSize: 15 }}>Remove from library</Text>
      </Pressable>
    </ScrollView>
  );
}

function Section({
  title,
  colors,
  children,
}: {
  title: string;
  colors: ReturnType<typeof useColors>;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={[styles.sectionTitle, { color: colors.mutedText }]}>{title.toUpperCase()}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 24, paddingBottom: 48 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  top: { flexDirection: 'row', gap: 16 },
  cover: { width: 120 },
  titleBlock: { flex: 1, gap: 6, justifyContent: 'center' },
  notice: { borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, padding: 12 },
  title: { fontSize: 22, fontWeight: '700' },
  subtitle: { fontSize: 15 },
  authors: { fontSize: 16 },
  section: { gap: 10 },
  sectionTitle: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6 },
  hint: { fontSize: 13 },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  detailLabel: { fontSize: 15 },
  detailValue: { fontSize: 15, flexShrink: 1, textAlign: 'right' },
  notes: {
    minHeight: 96,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 12,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  delete: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
});
