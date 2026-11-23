// Website version: the browser tiles the chosen pattern itself (CSS background-repeat).
import { Asset } from 'expo-asset';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useBackground } from '../services/appearance';
import { tileFor } from './backgrounds';
import { useColors } from './useColors';

export function AppBackground({ children }: { children: ReactNode }) {
  const colors = useColors();
  const tile = Asset.fromModule(tileFor(useBackground()));
  const size = tile.width && tile.height ? `${tile.width}px ${tile.height}px` : 'auto';
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100%',
        backgroundColor: colors.background,
        backgroundImage: `url("${tile.uri}")`,
        backgroundRepeat: 'repeat',
        backgroundSize: size,
      }}>
      <View style={[styles.fill, { backgroundColor: colors.overlay }]}>{children}</View>
    </div>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
