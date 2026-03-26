import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import 'react-native-reanimated';

import { useColorScheme } from '@/hooks/use-color-scheme';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();

  return (
    // GestureHandlerRootView нужен для корректной работы свайпов во всём приложении,
    // включая swipe-жесты на карточках вопросов и вариантах ответа.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="create" options={{ headerShown: false }} />
            {/* На игровых экранах отключаем swipe-back, чтобы случайный жест не выбрасывал
                хоста или игрока из активной сессии без возможности легко вернуться обратно. */}
            <Stack.Screen name="host-game" options={{ headerShown: false, gestureEnabled: false, fullScreenGestureEnabled: false }} />
            <Stack.Screen name="player-game" options={{ headerShown: false, gestureEnabled: false, fullScreenGestureEnabled: false }} />
            <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} />
          </Stack>
          <StatusBar style="auto" />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
