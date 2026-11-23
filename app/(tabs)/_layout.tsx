import { SymbolView } from 'expo-symbols';
import { router, Tabs } from 'expo-router';
import { Pressable, Text, View } from 'react-native';

import { ConnectionToggle } from '@/src/components/ConnectionToggle';

import Colors from '@/constants/Colors';
import { useColorScheme } from '@/components/useColorScheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme].tint,
        headerShown: true,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Library',
          tabBarIcon: ({ color }) => (
            <SymbolView
              name={{ ios: 'books.vertical', android: 'menu_book', web: 'menu_book' }}
              tintColor={color}
              size={28}
            />
          ),
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16, marginRight: 16 }}>
              <ConnectionToggle />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add a book by hand"
                hitSlop={8}
                onPress={() => router.push('/edit-book')}>
                <Text style={{ color: Colors[colorScheme].tint, fontSize: 16, fontWeight: '600' }}>+ Add</Text>
              </Pressable>
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="scan"
        options={{
          title: 'Scan',
          headerRight: () => (
            <View style={{ marginRight: 16 }}>
              <ConnectionToggle />
            </View>
          ),
          tabBarIcon: ({ color }) => (
            <SymbolView
              name={{ ios: 'barcode.viewfinder', android: 'barcode_scanner', web: 'barcode_scanner' }}
              tintColor={color}
              size={28}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => (
            <SymbolView
              name={{ ios: 'gearshape', android: 'settings', web: 'settings' }}
              tintColor={color}
              size={28}
            />
          ),
        }}
      />
    </Tabs>
  );
}
