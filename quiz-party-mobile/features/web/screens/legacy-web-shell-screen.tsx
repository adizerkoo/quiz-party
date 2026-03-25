import { StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { SafeAreaView } from 'react-native-safe-area-context';

// Оставляем старый WebView-экран как reference, чтобы было легко
// сравнить новый native UI с прошлой мобильной обёрткой.
export function LegacyWebShellScreen() {
  const webAppUrl = `http://192.168.1.63:8000/?nocache=${Math.random()}`;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <WebView
        source={{ uri: webAppUrl }}
        style={styles.webview}
        bounces={false}
        cacheEnabled={false}
        domStorageEnabled
        sharedCookiesEnabled
        showsVerticalScrollIndicator={false}
        showsHorizontalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});
