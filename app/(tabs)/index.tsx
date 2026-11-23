import { router, useFocusEffect } from 'expo-router';
import { useDb } from '@/src/db/DbProvider';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { getCounts, listBooks } from '@/src/db';
import { BookCard } from '@/src/components/BookCard';
import { SegmentedControl } from '@/src/components/SegmentedControl';
import { useColors } from '@/src/components/useColors';
import type { Book, LibraryCounts, ReadStatus, SortKey } from '@/src/types';
import { onLibraryChanged } from '@/src/services/libraryEvents';
import { countsSummary } from '@/src/utils/format';

type Filter = 'all' | ReadStatus;

const FILTERS = [
  { value: 'all', label: 'All' },
  { value: 'read', label: 'Read' },
  { value: 'to_read', label: 'To Be Read' },
] as const;

const SORTS: { value: SortKey; label: string }[] = [
  { value: 'dateAdded', label: 'Newest' },
  { value: 'title', label: 'Title' },
  { value: 'author', label: 'Author' },
  { value: 'rating', label: 'Rating' },
];

const COLUMNS = 3;

export default function LibraryScreen() {
  const db = useDb();
  const colors = useColors();

  const [books, setBooks] = useState<Book[]>([]);
  const [counts, setCounts] = useState<LibraryCounts | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<SortKey>('dateAdded');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    const [list, c] = await Promise.all([
      listBooks(db, { status: filter === 'all' ? undefined : filter, search, sort }),
      getCounts(db),
    ]);
    setBooks(list);
    setCounts(c);
  }, [db, filter, search, sort]);

  // Reloads when the tab is shown (e.g. back from a book's page, where it may have
  // been rated or removed) and whenever the search, filter or sort changes.
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  // Also reload when books are filled in in the background.
  useEffect(() => onLibraryChanged(load), [load]);

  const libraryEmpty = counts?.total === 0;

  const header = (
    <View style={styles.header}>
      {counts && (
        <Text style={[styles.summary, { color: colors.mutedText }]}>{countsSummary(counts)}</Text>
      )}
      <TextInput
        value={search}
        onChangeText={setSearch}
        placeholder="Search title or author"
        placeholderTextColor={colors.mutedText}
        style={[styles.search, { color: colors.text, backgroundColor: colors.card, borderColor: colors.border }]}
        clearButtonMode="while-editing"
        autoCorrect={false}
        returnKeyType="search"
        accessibilityLabel="Search books"
      />
      <SegmentedControl options={FILTERS} value={filter} onChange={setFilter} />
      <View style={styles.sortRow}>
        <Text style={[styles.sortLabel, { color: colors.mutedText }]}>Sort:</Text>
        {SORTS.map((s) => {
          const selected = s.value === sort;
          return (
            <Pressable
              key={s.value}
              onPress={() => setSort(s.value)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              style={[
                styles.chip,
                { borderColor: selected ? colors.tint : colors.border },
                selected && { backgroundColor: colors.tint },
              ]}>
              <Text style={{ color: selected ? colors.onTint : colors.text, fontSize: 13 }}>{s.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: 'transparent' }]}>
      <FlatList
        data={books}
        keyExtractor={(b) => String(b.id)}
        numColumns={COLUMNS}
        ListHeaderComponent={libraryEmpty ? undefined : header}
        columnWrapperStyle={styles.columns}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item, index }) => (
          <>
            <BookCard
              book={item}
              onPress={() => router.push({ pathname: '/book/[id]', params: { id: String(item.id) } })}
            />
            {/* Keep the last row's tiles the same width as the others. */}
            {index === books.length - 1 &&
              Array.from({ length: (COLUMNS - (books.length % COLUMNS)) % COLUMNS }, (_, i) => (
                <View key={`spacer-${i}`} style={{ flex: 1 }} />
              ))}
          </>
        )}
        ListEmptyComponent={
          counts === null ? undefined : (
            <View style={styles.empty}>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                {libraryEmpty ? 'Your library is empty' : 'No matching books'}
              </Text>
              <Text style={[styles.emptyText, { color: colors.mutedText }]}>
                {libraryEmpty
                  ? 'Open the Scan tab and point the camera at a book\'s barcode, or tap + Add to type one in. To try the app first, add sample books from the Settings tab.'
                  : 'Try a different search or filter.'}
              </Text>
            </View>
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, gap: 18, flexGrow: 1 },
  columns: { gap: 14 },
  header: { gap: 12 },
  summary: { fontSize: 14 },
  search: {
    height: 42,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    fontSize: 16,
  },
  sortRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 },
  sortLabel: { fontSize: 13, marginRight: 2 },
  chip: {
    borderWidth: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 8 },
  emptyTitle: { fontSize: 18, fontWeight: '700' },
  emptyText: { fontSize: 15, textAlign: 'center', lineHeight: 21 },
});
