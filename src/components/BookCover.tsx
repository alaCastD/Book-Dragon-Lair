import { useState } from 'react';
import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import type { Book } from '../types';
import { useOnlineAllowed } from '../services/connection';
import { coverUri } from '../utils/format';
import { useColors } from './useColors';

interface Props {
  book: Pick<Book, 'title' | 'coverLocalUri' | 'coverRemoteUrl'>;
  style?: StyleProp<ViewStyle>;
  /** Font size of the title shown when there is no cover image. */
  fallbackFontSize?: number;
}

/** A book cover at a 2:3 ratio. Shows the title on a plain card when no image is available. */
export function BookCover({ book, style, fallbackFontSize = 13 }: Props) {
  const colors = useColors();
  const online = useOnlineAllowed();
  const uri = coverUri(book, online);
  // Remember which address failed, so a new cover (e.g. after editing) is tried again.
  const [failedUri, setFailedUri] = useState<string | null>(null);

  const showImage = uri !== null && uri !== failedUri;

  return (
    <View style={[styles.frame, { backgroundColor: colors.card, borderColor: colors.border }, style]}>
      {showImage ? (
        <Image
          source={{ uri: uri! }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
          onError={() => setFailedUri(uri)}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Text
          style={[styles.fallback, { color: colors.mutedText, fontSize: fallbackFontSize }]}
          numberOfLines={5}>
          {book.title}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    aspectRatio: 2 / 3,
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallback: { textAlign: 'center', padding: 8, fontWeight: '600' },
});
