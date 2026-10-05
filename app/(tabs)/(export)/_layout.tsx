import { Stack } from 'expo-router';

export default function ExportLayout() {
  return (
    <Stack
      screenOptions={{
        headerTransparent: false,
        headerShadowVisible: false,
        headerLargeTitle: false,
        headerBackButtonDisplayMode: 'minimal',
      }}
    />
  );
}
