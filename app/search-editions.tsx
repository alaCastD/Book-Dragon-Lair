import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';

import { useDb } from '@/src/db/DbProvider';
import { BookCover } from '@/src/components/BookCover';
import { SegmentedControl } from '@/src/components/SegmentedControl';
import { useColors } from '@/src/components/useColors';
import { addFromSearch } from '@/src/services/addFromSearch';
import { requestSync } from '@/src/services/backgroundSync';
import { formatIsbn } from '@/src/services/isbn';
import { notifyLibraryChanged } from '@/src/services/libraryEvents';
import type { Fetch } from '@/src/services/lookup';
import {
  bookFromEdition,
  bookFromWork,
  dedupeEditions,
  deviceLanguage,
  inLanguage,
  listEditions,
  sortEditions,
  type EditionResult,
  type WorkResult,
} from '@/src/services/titleSearch';
import type { NewBook } from '@/src/types';
import { showMessage } from '@/src/utils/dialogs';

/** Step 2 of adding by title: pick the edition you own. */
export default function SearchEditionsScreen() {
  const p = useLocalSearchParams<{ key: string; title: string; authors: string; cover: string; year: string; count: string }>();
  const db = useDb();
  const colors = useColors();
  const language = useMemo(() => deviceLanguage(), []);

  const work: WorkResult = {
    key: p.key,
    title: p.title,
    authors: p.authors || null,
    coverUrl: p.cover || null,
    firstPublished: p.year ? Number(p.year) : null,
    editionCount: Number(p.count) || 0,
  };

  const [loaded, setLoaded] = useState<EditionResult[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState<string | null>(null);
  const [filter, setFilter] = useState<'mine' | 'all'>('mine');
  const [adding, setAdding] = useState(false);
  /** How many records have been fetched so far; the next page starts here. */
  const [fetched, setFetched] = useState(0);

  /** Fetches the page starting at `offset` and adds it to what's shown. */
  const fetchPage = useCallback(
    (offset: number) =>
      listEditions(fetch as unknown as Fetch, p.key, offset).then(
        (page) => {
          setLoaded((prev) => dedupeEditions([...prev, ...page.editions]));
          setTotal(page.total);
          setFetched(offset + page.received);
          setLoading(false);
        },
        (e: Error) => {
          setProblem(e.message);
          setLoading(false);
        },
      ),
    [p.key],
  );

  // First page when the screen opens.
  useEffect(() => {
    fetchPage(0);
  }, [fetchPage]);

  const loadMore = (offset: number) => {
    setLoading(true);
    setProblem(null);
    fetchPage(offset);
  };

  const shown = useMemo(() => {
    const sorted = sortEditions(loaded, language.code);
    return filter === 'mine' ? inLanguage(sorted, language.code) : sorted;
  }, [loaded, filter, language.code]);
  const hiddenByFilter = loaded.length - shown.length;
  const more = total !== null && fetched < total && fetched > 0;

  const add = async (book: NewBook, thenEdit = false) => {
    if (adding) return;
    setAdding(true);
    try {
      const r = await addFromSearch(db, book);
      if (r.kind === 'duplicate') {
        showMessage('Already in your library', `"${r.book.title}" with this ISBN is already in your library.`);
      } else {
        notifyLibraryChanged();
        requestSync(db); // saves the cover, fills any missing details
      }
      // Back to the library, then open the book (or its edit form).
      router.dismissAll();
      if (thenEdit && r.kind === 'added') {
        router.push({ pathname: '/edit-book', params: { id: String(r.book.id) } });
      } else {
        router.push({ pathname: '/book/[id]', params: { id: String(r.book.id) } });
      }
    } catch (e) {
      showMessage("Couldn't add the book", (e as Error).message);
    } finally {
      setAdding(false);
    }
  };

  const header = (
    <View style={styles.header}>
      <View style={styles.workRow}>
        <BookCover book={{ title: work.title, coverLocalUri: null, coverRemoteUrl: work.coverUrl }} style={styles.workCover} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text style={[styles.workTitle, { color: colors.text }]}>{work.title}</Text>
          {work.authors ? <Text style={{ color: colors.text, fontSize: 15 }}>{work.authors}</Text> : null}
          <Text style={{ color: colors.mutedText, fontSize: 13 }}>
            {total !== null ? `${total} ${total === 1 ? 'edition' : 'editions'}` : ' '}
          </Text>
        </View>
      </View>
      <Text style={[styles.hint, { color: colors.text }]}>
        Choose the edition you own. Check the publisher, year and ISBN on your copy (usually on the back cover or the
        copyright page).
      </Text>
      <SegmentedControl
        options={[
          { value: 'mine', label: `${language.name} first` },
          { value: 'all', label: 'All languages' },
        ]}
        value={filter}
        onChange={setFilter}
      />
      {filter === 'mine' && hiddenByFilter > 0 && (
        <Text style={[styles.hint, { color: colors.mutedText }]}>
          {hiddenByFilter} {hiddenByFilter === 1 ? 'edition' : 'editions'} in other languages hidden.
        </Text>
      )}
    </View>
  );

  const footer = (
    <View style={styles.footer}>
      {loading && <ActivityIndicator color={colors.tint} />}
      {problem && (
        <>
          <Text style={{ color: colors.danger, fontSize: 14, textAlign: 'center' }}>{problem}</Text>
          <Pressable accessibilityRole="button" onPress={() => loadMore(fetched)} hitSlop={8}>
            <Text style={[styles.link, { color: colors.tint }]}>Try again</Text>
          </Pressable>
        </>
      )}
      {!loading && more && !problem && (
        <Pressable
          accessibilityRole="button"
          onPress={() => loadMore(fetched)}
          style={({ pressed }) => [styles.outline, { borderColor: colors.tint, opacity: pressed ? 0.6 : 1 }]}>
          <Text style={{ color: colors.tint, fontWeight: '600', fontSize: 15 }}>
            Show more editions ({fetched} of {total} loaded)
          </Text>
        </Pressable>
      )}
      {!loading && (
        <View style={[styles.notice, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>Can&apos;t find your edition?</Text>
          <Text style={{ color: colors.mutedText, fontSize: 14, lineHeight: 20 }}>
            Add the book now and fill in your copy&apos;s publisher, year and ISBN yourself.
          </Text>
          <Pressable accessibilityRole="button" onPress={() => add(bookFromWork(work), true)} hitSlop={8}>
            <Text style={[styles.link, { color: colors.tint }]}>Add &quot;{work.title}&quot; and edit details</Text>
          </Pressable>
        </View>
      )}
    </View>
  );

  return (
    <View style={{ flex: 1 }}>
      <Stack.Screen options={{ title: 'Choose your edition' }} />
      <FlatList
        data={shown}
        keyExtractor={(e) => e.key}
        contentContainerStyle={styles.content}
        ListHeaderComponent={header}
        ListFooterComponent={footer}
        ListEmptyComponent={
          !loading && !problem && total !== null ? (
            <Text style={[styles.hint, { color: colors.mutedText, textAlign: 'center' }]}>
              {loaded.length ? `No ${language.name} editions loaded yet. Try "All languages" or show more.` : 'Open Library lists no editions for this book.'}
            </Text>
          ) : undefined
        }
        renderItem={({ item }) => {
          const facts = [item.publisher, item.publishDate, item.format, item.pageCount && `${item.pageCount} pages`].filter(Boolean).join(' · ');
          return (
            <Pressable
              onPress={() => add(bookFromEdition(work, item))}
              disabled={adding}
              accessibilityRole="button"
              accessibilityLabel={`Add ${item.title}${facts ? `, ${facts}` : ''}${item.isbn ? `, ISBN ${item.isbn}` : ''}`}
              style={({ pressed }) => [
                styles.row,
                { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed || adding ? 0.7 : 1 },
              ]}>
              <BookCover book={{ title: item.title, coverLocalUri: null, coverRemoteUrl: item.coverUrl }} style={styles.cover} fallbackFontSize={9} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={2}>
                  {item.title}
                  {item.subtitle ? `: ${item.subtitle}` : ''}
                </Text>
                {facts ? <Text style={{ color: colors.mutedText, fontSize: 13 }}>{facts}</Text> : null}
                {item.edition ? <Text style={{ color: colors.mutedText, fontSize: 13 }}>{item.edition}</Text> : null}
                <Text style={{ color: colors.mutedText, fontSize: 13 }}>
                  {item.isbn ? `ISBN ${formatIsbn(item.isbn)}` : 'No ISBN listed'}
                  {item.languages.length && !item.languages.includes(language.code) ? ` · ${item.languages.join(', ')}` : ''}
                </Text>
              </View>
              <Text style={{ color: colors.tint, fontWeight: '700', fontSize: 15 }}>Add</Text>
            </Pressable>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 10, paddingBottom: 48 },
  header: { gap: 12, marginBottom: 4 },
  workRow: { flexDirection: 'row', gap: 14, alignItems: 'center' },
  workCover: { width: 72 },
  workTitle: { fontSize: 20, fontWeight: '700' },
  hint: { fontSize: 13, lineHeight: 19 },
  footer: { gap: 12, marginTop: 6, alignItems: 'stretch' },
  outline: { borderWidth: 1, borderRadius: 10, paddingVertical: 11, alignItems: 'center' },
  notice: { borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, padding: 12, gap: 4 },
  link: { fontWeight: '600', fontSize: 15, marginTop: 4, textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  cover: { width: 48 },
  rowTitle: { fontSize: 15, fontWeight: '700' },
});
