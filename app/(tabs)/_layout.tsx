import React from 'react';
import { View } from 'react-native';
import { Stack, usePathname } from 'expo-router';
import FloatingTabBar, { TabBarItem } from '@/components/FloatingTabBar';

const TABS: TabBarItem[] = [
  {
    name: '(import)',
    route: '/(tabs)/(import)' as any,
    icon: 'file-download',
    label: 'Import',
  },
  {
    name: '(ricezione)',
    route: '/(tabs)/(ricezione)' as any,
    icon: 'inventory',
    label: 'Ricezione',
  },
  {
    name: '(lavorazione)',
    route: '/(tabs)/(lavorazione)' as any,
    icon: 'build',
    label: 'Lavorazione',
  },
  {
    name: '(export)',
    route: '/(tabs)/(export)' as any,
    icon: 'file-upload',
    label: 'Export',
  },
];

export default function TabLayout() {
  return (
    <View style={{ flex: 1 }}>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: 'none',
        }}
      >
        <Stack.Screen name="(import)" />
        <Stack.Screen name="(ricezione)" />
        <Stack.Screen name="(lavorazione)" />
        <Stack.Screen name="(export)" />
      </Stack>
      <FloatingTabBar tabs={TABS} containerWidth={340} />
    </View>
  );
}
