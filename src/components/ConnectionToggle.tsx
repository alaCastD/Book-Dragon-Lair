import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useDb } from '../db/DbProvider';
import { setOnlineAllowed, useOnlineAllowed } from '../services/connection';
import { useColors } from './useColors';

/** A small Online / Offline button for screen headers. Tap to switch. */
export function ConnectionToggle() {
  const db = useDb();
  const colors = useColors();
  const online = useOnlineAllowed();

  return (
    <Pressable
      onPress={() => setOnlineAllowed(db, !online)}
      accessibilityRole="switch"
      accessibilityState={{ checked: online }}
      accessibilityLabel="Use the internet"
      accessibilityHint={online ? 'Switches the app to Offline' : 'Switches the app to Online'}
      hitSlop={8}
      style={({ pressed }) => [
        styles.pill,
        { borderColor: online ? colors.online : colors.border, opacity: pressed ? 0.6 : 1 },
      ]}>
      <View style={[styles.dot, { backgroundColor: online ? colors.online : colors.mutedText }]} />
      <Text style={[styles.label, { color: online ? colors.text : colors.mutedText }]}>
        {online ? 'Online' : 'Offline'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  label: { fontSize: 13, fontWeight: '600' },
});
