import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { Book } from '../types';
import { BookCover } from './BookCover';
import { StarRating } from './StarRating';
import { useColors } from './useColors';

interface Props {
  book: Book;
  onPress: () => void;
}

/** One tile in the library grid: cover, title, author and rating. */
export function BookCard({ book, onPress }: Props) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, { opacity: pressed ? 0.7 : 1 }]}
      accessibilityRole="button"
      accessibilityLabel={`${book.title}${book.authors ? ` by ${book.authors}` : ''}, ${
        book.status === 'read' ? 'read' : 'to be read'
      }`}>
      <View>
        <BookCover book={book} />
        {book.status === 'read' && (
          <View style={[styles.badge, { backgroundColor: colors.tint }]}>
            <Text style={[styles.badgeText, { color: colors.onTint }]}>✓ Read</Text>
          </View>
        )}
        {book.lookupState === 'pending' && (
          <View style={[styles.badge, { backgroundColor: colors.mutedText }]}>
            <Text style={[styles.badgeText, { color: colors.background }]}>Pending</Text>
          </View>
        )}
      </View>
      <Text style={[styles.title, { color: colors.text }]} numberOfLines={2}>
        {book.title}
      </Text>
      {book.authors ? (
        <Text style={[styles.author, { color: colors.mutedText }]} numberOfLines={1}>
          {book.authors}
        </Text>
      ) : null}
      {book.rating > 0 && <StarRating rating={book.rating} size={13} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, gap: 3 },
  title: { fontSize: 13, fontWeight: '600', marginTop: 4 },
  author: { fontSize: 12 },
  badge: {
    position: 'absolute',
    top: 6,
    left: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  badgeText: { fontSize: 11, fontWeight: '700' },
});
