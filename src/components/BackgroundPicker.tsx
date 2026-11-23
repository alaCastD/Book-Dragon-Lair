import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { useDb } from '../db/DbProvider';
import { setBackground, useBackground } from '../services/appearance';
import { BACKGROUNDS } from './backgrounds';
import { useColors } from './useColors';

/** Three swatches of the background patterns; tap one to use it. */
export function BackgroundPicker() {
  const db = useDb();
  const colors = useColors();
  const current = useBackground();

  return (
    <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel="Background">
      {BACKGROUNDS.map((b) => {
        const selected = b.name === current;
        return (
          <Pressable
            key={b.name}
            onPress={() => setBackground(db, b.name)}
            accessibilityRole="radio"
            aria-checked={selected}
            accessibilityLabel={b.label}
            style={({ pressed }) => [styles.option, { opacity: pressed ? 0.7 : 1 }]}>
            <View
              style={[
                styles.swatch,
                { borderColor: selected ? colors.tint : colors.border, borderWidth: selected ? 3 : 1 },
              ]}>
              <Image source={b.tile} resizeMode="repeat" style={StyleSheet.absoluteFill} />
              {selected && (
                <View style={[styles.check, { backgroundColor: colors.tint }]}>
                  <Text style={{ color: colors.onTint, fontSize: 12, fontWeight: '700' }}>✓</Text>
                </View>
              )}
            </View>
            <Text
              style={[styles.label, { color: colors.text, fontWeight: selected ? '700' : '500' }]}
              numberOfLines={2}>
              {b.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12 },
  option: { flex: 1, alignItems: 'center', gap: 6 },
  swatch: { width: '100%', aspectRatio: 1, borderRadius: 12, overflow: 'hidden' },
  check: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 13, textAlign: 'center' },
});
