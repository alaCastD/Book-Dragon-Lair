import { Pressable, StyleSheet, Text, View } from 'react-native';

import { nextRating, ratingLabel } from '../utils/rating';
import { useColors } from './useColors';

interface Props {
  rating: number;
  /** Omit to show the stars as read-only. */
  onChange?: (rating: number) => void;
  size?: number;
}

/** Five stars. Tap a star to rate; tap the current rating again to clear it. */
export function StarRating({ rating, onChange, size = 32 }: Props) {
  const colors = useColors();
  const stars = [1, 2, 3, 4, 5].map((n) => {
    const filled = n <= rating;
    const glyph = (
      <Text style={{ fontSize: size, lineHeight: size * 1.15, color: filled ? colors.star : colors.border }}>
        {filled ? '★' : '☆'}
      </Text>
    );
    if (!onChange) return <View key={n}>{glyph}</View>;
    return (
      <Pressable
        key={n}
        onPress={() => onChange(nextRating(rating, n))}
        hitSlop={4}
        accessibilityRole="button"
        accessibilityLabel={n === rating ? `Clear rating` : `Rate ${n} out of 5`}
        style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, paddingHorizontal: 2 })}>
        {glyph}
      </Pressable>
    );
  });

  return (
    <View
      style={styles.row}
      accessible={!onChange}
      accessibilityLabel={!onChange ? ratingLabel(rating) : undefined}>
      {stars}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
});
