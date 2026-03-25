// Базовый адрес backend/frontend web-части.
// Если сервер переедет на другой IP или домен, достаточно поменять
// значение только здесь, и все WebView-экраны начнут использовать новый адрес.
export const WEB_APP_ORIGIN = 'http://192.168.1.63:8000';

// Утилита для сборки полного URL web-страницы.
// path — это путь вроде `/create.html` или `/game.html`.
// params — query-параметры, которые нужно добавить к адресу.
export function buildWebAppUrl(
  path: string,
  params?: Record<string, string | number | undefined>,
) {
  const url = new URL(path, WEB_APP_ORIGIN);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value === undefined) {
        return;
      }

      url.searchParams.set(key, String(value));
    });
  }

  return url.toString();
}
