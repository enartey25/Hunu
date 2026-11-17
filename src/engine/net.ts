/**
 * One place for outbound requests: every call has a deadline, identical requests in
 * flight are shared, and successful responses are cached for a short time so retyping
 * a search or reopening the popup does not hit the network again.
 */

export interface FetchTextOptions {
  timeoutMs?: number;
  /** Cancels the request when the search it belongs to is superseded. */
  signal?: AbortSignal;
  method?: 'GET' | 'POST';
  body?: string;
  headers?: Record<string, string>;
  /** How long a successful response may be reused. 0 disables caching. */
  cacheTtlMs?: number;
  /** Responses larger than this are cut off (characters). */
  maxChars?: number;
}

export interface FetchTextResult {
  ok: boolean;
  status: number;
  text: string;
  /** Present when the request failed before or instead of a response. */
  error?: string;
  fromCache?: boolean;
}

const DEFAULT_TIMEOUT_MS = 6000;
const DEFAULT_TTL_MS = 10 * 60 * 1000;
const MAX_CACHE_ENTRIES = 60;

const cache = new Map<string, { at: number; ttl: number; result: FetchTextResult }>();

/**
 * Off the browser (the API's server-side search) requests carry Node's default user
 * agent, which OpenStreetMap's usage policy refuses. There they name the application.
 * In the extension and on the website the browser sets its own and this is unused.
 */
const SERVER_HEADERS: Record<string, string> =
  typeof window === 'undefined' && typeof (globalThis as { process?: unknown }).process !== 'undefined'
    ? { 'user-agent': 'Hunu/1.0 (price comparison for buyers in Ghana)' }
    : {};
const inFlight = new Map<string, Promise<FetchTextResult>>();

function cacheKey(url: string, options: FetchTextOptions): string {
  return `${options.method || 'GET'} ${url} ${options.body || ''}`;
}

export async function fetchText(url: string, options: FetchTextOptions = {}): Promise<FetchTextResult> {
  const ttl = options.cacheTtlMs ?? DEFAULT_TTL_MS;
  const key = cacheKey(url, options);

  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < hit.ttl) {
    return { ...hit.result, fromCache: true };
  }

  const pending = inFlight.get(key);
  if (pending) return pending;

  const run = (async (): Promise<FetchTextResult> => {
    const controller = new AbortController();
    const onAbort = () => controller.abort();
    if (options.signal) {
      if (options.signal.aborted) controller.abort();
      else options.signal.addEventListener('abort', onAbort, { once: true });
    }
    const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        method: options.method || 'GET',
        body: options.body,
        headers: { ...SERVER_HEADERS, ...(options.headers || {}) },
        signal: controller.signal,
        credentials: 'omit',
        redirect: 'follow'
      });
      let text = await response.text();
      if (options.maxChars && text.length > options.maxChars) text = text.slice(0, options.maxChars);
      const result: FetchTextResult = { ok: response.ok, status: response.status, text };
      if (response.status === 200 && ttl > 0) {
        if (cache.size >= MAX_CACHE_ENTRIES) {
          const oldest = cache.keys().next().value;
          if (oldest !== undefined) cache.delete(oldest);
        }
        cache.set(key, { at: Date.now(), ttl, result });
      }
      return result;
    } catch (err) {
      const aborted = options.signal?.aborted;
      return {
        ok: false,
        status: 0,
        text: '',
        error: aborted ? 'cancelled' : controller.signal.aborted ? 'timeout' : String((err as Error)?.message || err)
      };
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
      inFlight.delete(key);
    }
  })();

  inFlight.set(key, run);
  return run;
}

/** Runs `worker` over `items` with at most `limit` running at once, keeping input order. */
export async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}

/** For tests. */
export function clearFetchCache(): void {
  cache.clear();
}
