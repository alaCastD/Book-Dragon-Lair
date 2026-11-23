import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SQLiteProvider } from 'expo-sqlite';
import { Suspense, useEffect } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/components/useColorScheme';
import { DATABASE_NAME, migrate } from '@/src/db';
import { useBackgroundSync } from '@/src/services/backgroundSync';

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
    <Suspense fallback={null}>
      {/* Opens (or creates) the on-device database and runs migrations before any screen renders. */}
      <SQLiteProvider databaseName={DATABASE_NAME} onInit={migrate} useSuspense>
        <RootLayoutNav />
      </SQLiteProvider>
    </Suspense>
  );
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  // Fill in details and covers for scanned books whenever the phone is online.
  useBackgroundSync();

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
