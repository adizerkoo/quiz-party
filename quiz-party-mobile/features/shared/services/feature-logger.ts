type LogLevel = 'debug' | 'info' | 'warn' | 'error';

function writeLog(
  scope: string,
  level: LogLevel,
  event: string,
  payload?: Record<string, unknown> | null,
) {
  const method = console[level] ?? console.log;
  const prefix = `[${scope}] ${event}`;

  if (payload && Object.keys(payload).length > 0) {
    method(prefix, payload);
    return;
  }

  method(prefix);
}

export function createFeatureLogger(scope: string) {
  return {
    debug(event: string, payload?: Record<string, unknown> | null) {
      if (!__DEV__) {
        return;
      }
      writeLog(scope, 'debug', event, payload);
    },
    info(event: string, payload?: Record<string, unknown> | null) {
      writeLog(scope, 'info', event, payload);
    },
    warn(event: string, payload?: Record<string, unknown> | null) {
      writeLog(scope, 'warn', event, payload);
    },
    error(event: string, payload?: Record<string, unknown> | null) {
      writeLog(scope, 'error', event, payload);
    },
  };
}
