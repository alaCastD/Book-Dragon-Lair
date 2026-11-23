import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/components/useColorScheme';
import { DbProvider } from '@/src/db/DbProvider';
import { useBackgroundSync, useConnectionSettingLoaded } from '@/src/services/backgroundSync';

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  anchor: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return (
    // Opens the library (on the phone, or in the browser on the website) before any screen renders.
    <DbProvider>
      <RootLayoutNav />
    </DbProvider>
  );
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  // Fill in details and covers for scanned books while the app is set to Online.
  const ready = useConnectionSettingLoaded();
  useBackgroundSync(ready);
  if (!ready) return null;

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Stack>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="book/[id]" options={{ title: '' }} />
        <Stack.Screen name="edit-book" options={{ title: '' }} />
      </Stack>
    </ThemeProvider>
  );
}
