const DEFAULT_TIMEOUT_MS = 15_000;

export async function fetchWithTimeout(
  input: string,
  init?: RequestInit,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const existingSignal = init?.signal;

  if (existingSignal?.aborted) {
    controller.abort(existingSignal.reason);
  } else {
    existingSignal?.addEventListener('abort', () => controller.abort(existingSignal.reason), {
      once: true,
    });
  }

  const timer = setTimeout(() => controller.abort(new Error('Request timeout')), timeoutMs);

  try {
    const response = await fetch(input, {
      ...init,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timer);
  }
}
