import { router, Stack } from 'expo-router';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useDb } from '@/src/db/DbProvider';
import { BookCover } from '@/src/components/BookCover';
import { useColors } from '@/src/components/useColors';
import { setOnlineAllowed, useOnlineAllowed } from '@/src/services/connection';
import type { Fetch } from '@/src/services/lookup';
import { searchWorks, type WorkResult } from '@/src/services/titleSearch';

/** Step 1 of adding by title: find the book. Step 2 (search-editions) picks the edition. */
export default function SearchBookScreen() {
  const db = useDb();
  const colors = useColors();
  const online = useOnlineAllowed();

  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');
  const [results, setResults] = useState<WorkResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const latest = useRef(0);

  const search = async () => {
    if (!title.trim()) return;
    const id = ++latest.current;
    setSearching(true);
    setProblem(null);
    try {
      const found = await searchWorks(fetch as unknown as Fetch, title, author);
      if (id === latest.current) setResults(found);
    } catch (e) {
      if (id === latest.current) setProblem((e as Error).message);
    } finally {
      if (id === latest.current) setSearching(false);
    }
  };

  const open = (w: WorkResult) =>
    router.push({
      pathname: '/search-editions',
      params: {
        key: w.key,
        title: w.title,
        authors: w.authors ?? '',
        cover: w.coverUrl ?? '',
        year: w.firstPublished ? String(w.firstPublished) : '',
        count: String(w.editionCount),
      },
    });

  const inputStyle = [styles.input, { color: colors.text, backgroundColor: colors.card, borderColor: colors.border }];

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <Stack.Screen options={{ title: 'Search by title' }} />
      <FlatList
        data={results ?? []}
        keyExtractor={(w) => w.key}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View style={styles.form}>
            {!online && (
              <View style={[styles.notice, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={{ color: colors.text, fontSize: 14, lineHeight: 20 }}>
                  Searching needs the internet, and the app is set to Offline.
                </Text>
                <Pressable accessibilityRole="button" onPress={() => setOnlineAllowed(db, true)} hitSlop={8}>
                  <Text style={[styles.link, { color: colors.tint }]}>Go online</Text>
                </Pressable>
              </View>
            )}
            <TextInput
              value={title}
              onChangeText={setTitle}
              placeholder="Title, e.g. The Hobbit"
              placeholderTextColor={colors.mutedText}
              style={inputStyle}
              autoFocus
              returnKeyType="search"
              onSubmitEditing={search}
              accessibilityLabel="Title"
            />
            <TextInput
              value={author}
              onChangeText={setAuthor}
              placeholder="Author (optional)"
              placeholderTextColor={colors.mutedText}
              style={inputStyle}
              returnKeyType="search"
              onSubmitEditing={search}
              accessibilityLabel="Author"
            />
            <Pressable
              onPress={search}
              disabled={!online || searching || !title.trim()}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.button,
                { backgroundColor: colors.tint, opacity: pressed || !online || searching || !title.trim() ? 0.6 : 1 },
              ]}>
              <Text style={[styles.buttonText, { color: colors.onTint }]}>Search</Text>
            </Pressable>
            {searching && <ActivityIndicator style={{ marginTop: 8 }} color={colors.tint} />}
            {problem && <Text style={[styles.problem, { color: colors.danger }]}>{problem}</Text>}
            {results && !searching && results.length > 0 && (
              <Text style={[styles.hint, { color: colors.mutedText }]}>Tap your book to choose its edition.</Text>
            )}
          </View>
        }
        ListEmptyComponent={
          results && !searching && !problem ? (
            <View style={styles.empty}>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>No books found</Text>
              <Text style={[styles.hint, { color: colors.mutedText, textAlign: 'center' }]}>
                Check the spelling, try fewer words, or leave out the author.
              </Text>
              <Pressable accessibilityRole="button" onPress={() => router.replace('/edit-book')} hitSlop={8}>
                <Text style={[styles.link, { color: colors.tint }]}>Add it by hand instead</Text>
              </Pressable>
            </View>
          ) : undefined
        }
        renderItem={({ item }) => (
          <Pressable
            onPress={() => open(item)}
            accessibilityRole="button"
            accessibilityLabel={`${item.title}${item.authors ? ` by ${item.authors}` : ''}${item.firstPublished ? `, first published ${item.firstPublished}` : ''}`}
            style={({ pressed }) => [
              styles.row,
              { backgroundColor: colors.card, borderColor: colors.border, opacity: pressed ? 0.7 : 1 },
            ]}>
            <BookCover book={{ title: item.title, coverLocalUri: null, coverRemoteUrl: item.coverUrl }} style={styles.cover} fallbackFontSize={10} />
            <View style={styles.rowText}>
              <Text style={[styles.rowTitle, { color: colors.text }]} numberOfLines={2}>
                {item.title}
              </Text>
              {item.authors ? (
                <Text style={{ color: colors.mutedText, fontSize: 14 }} numberOfLines={1}>
                  {item.authors}
                </Text>
              ) : null}
              <Text style={{ color: colors.mutedText, fontSize: 13 }}>
                {[item.firstPublished && `First published ${item.firstPublished}`, item.editionCount && `${item.editionCount} ${item.editionCount === 1 ? 'edition' : 'editions'}`]
                  .filter(Boolean)
                  .join(' · ')}
              </Text>
            </View>
            <Text style={{ color: colors.mutedText, fontSize: 22 }}>›</Text>
          </Pressable>
        )}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 10, paddingBottom: 48 },
  form: { gap: 10, marginBottom: 6 },
  input: { minHeight: 44, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, fontSize: 16 },
  button: { borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  buttonText: { fontSize: 16, fontWeight: '700' },
  notice: { borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, padding: 12, gap: 6 },
  link: { fontWeight: '600', fontSize: 15, marginTop: 4 },
  problem: { fontSize: 14 },
  hint: { fontSize: 13, lineHeight: 18 },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 24 },
  emptyTitle: { fontSize: 17, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 10,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  cover: { width: 52 },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 16, fontWeight: '700' },
});
