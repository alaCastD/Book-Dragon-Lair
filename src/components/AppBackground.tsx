// Phone version: the chosen pattern tiled behind every screen. (The website
// uses AppBackground.web.tsx, because tiling an image works differently there.)
import type { ReactNode } from 'react';
import { ImageBackground, StyleSheet, View } from 'react-native';

import { useBackground } from '../services/appearance';
import { tileFor } from './backgrounds';
import { useColors } from './useColors';

export function AppBackground({ children }: { children: ReactNode }) {
  const colors = useColors();
  const background = useBackground();
  return (
    <ImageBackground
      source={tileFor(background)}
      resizeMode="repeat"
      style={[styles.fill, { backgroundColor: colors.background }]}>
      <View style={[styles.fill, { backgroundColor: colors.overlay }]}>{children}</View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({ fill: { flex: 1 } });
