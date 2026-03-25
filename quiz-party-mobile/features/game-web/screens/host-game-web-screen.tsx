import { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { WebView, WebViewMessageEvent } from 'react-native-webview';

import { saveCreateDraft } from '@/features/create/services/create-storage';
import { CreateScreenDraft } from '@/features/create/types';
import { buildHostGameBridgeScript } from '@/features/game-web/utils/host-game-web-bridge';
import { buildWebAppUrl, WEB_APP_ORIGIN } from '@/features/web/config/web-app';

type NativeBridgeMessage = {
  type?: string;
  draft?: CreateScreenDraft;
};

// WebView-экран для уже существующей host-игры.
// Сам редактор мы сделали native, а игровую комнату пока оставляем web,
// чтобы не переписывать сокеты и игровые handlers в этом же шаге.
export function HostGameWebScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ room?: string }>();
  const roomCode = typeof params.room === 'string' ? params.room : '';
  const [hasError, setHasError] = useState(false);

  const gameUrl = useMemo(
    () =>
      buildWebAppUrl('/game.html', {
        role: 'host',
        room: roomCode,
      }),
    [roomCode],
  );
  const createUrl = useMemo(() => buildWebAppUrl('/create.html'), []);
  const menuIndexUrl = useMemo(() => buildWebAppUrl('/index.html'), []);
  const menuRootUrl = useMemo(() => buildWebAppUrl('/'), []);
  const injectedBridgeScript = useMemo(() => buildHostGameBridgeScript(), []);

  async function handleBridgeMessage(event: WebViewMessageEvent) {
    try {
      const parsed = JSON.parse(event.nativeEvent.data) as NativeBridgeMessage;

      if (parsed.type === 'back_to_native_create' && parsed.draft) {
        await saveCreateDraft(parsed.draft);
        router.replace('/create');
      }
    } catch (error) {
      // Игнорируем посторонние сообщения, которые не относятся к bridge.
    }
  }

  function handleShouldStartLoad(requestUrl: string) {
    if (requestUrl.startsWith(createUrl)) {
      router.replace('/create');
      return false;
    }

    if (requestUrl.startsWith(menuIndexUrl) || requestUrl === menuRootUrl) {
      router.replace('/');
      return false;
    }

    return true;
  }

  if (!roomCode) {
    return (
      <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
        <View style={styles.errorOverlay}>
          <Text style={styles.errorTitle}>Код комнаты не передан</Text>
          <Pressable onPress={() => router.replace('/create')} style={styles.button}>
            <Text style={styles.buttonText}>Вернуться к созданию</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <View style={styles.container}>
        <WebView
          source={{ uri: gameUrl }}
          style={styles.webview}
          bounces={false}
          cacheEnabled={false}
          domStorageEnabled
          injectedJavaScriptBeforeContentLoaded={injectedBridgeScript}
          onError={() => setHasError(true)}
          onHttpError={() => setHasError(true)}
          onMessage={handleBridgeMessage}
          onShouldStartLoadWithRequest={(request) => handleShouldStartLoad(request.url)}
          originWhitelist={['*']}
          setSupportMultipleWindows={false}
          sharedCookiesEnabled
          showsHorizontalScrollIndicator={false}
          showsVerticalScrollIndicator={false}
          startInLoadingState
          renderLoading={() => (
            <View style={styles.loadingOverlay}>
              <ActivityIndicator color="#6c5ce7" size="large" />
              <Text style={styles.loadingText}>Открываем комнату...</Text>
            </View>
          )}
        />

        {hasError ? (
          <View style={styles.errorOverlay}>
            <Text style={styles.errorTitle}>Не удалось открыть game.html</Text>
            <Text style={styles.errorText}>
              Проверь, что backend доступен по адресу {WEB_APP_ORIGIN}
            </Text>

            <Pressable onPress={() => router.replace('/create')} style={styles.button}>
              <Text style={styles.buttonText}>Вернуться к созданию</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // Базовый контейнер экрана с WebView.
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },

  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },

  // Экран загрузки комнаты.
  loadingOverlay: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    backgroundColor: '#ffffff',
  },

  loadingText: {
    color: '#6c5ce7',
    fontSize: 15,
    fontWeight: '700',
  },

  // Фолбэк-экран на случай ошибки загрузки.
  errorOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    backgroundColor: 'rgba(255,255,255,0.96)',
  },

  errorTitle: {
    color: '#3e27d8',
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
    textAlign: 'center',
  },

  errorText: {
    marginTop: 10,
    color: '#636e72',
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },

  // Кнопка возврата в native-экран создания.
  button: {
    minHeight: 54,
    marginTop: 24,
    paddingHorizontal: 22,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6c5ce7',
  },

  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
  },
});
