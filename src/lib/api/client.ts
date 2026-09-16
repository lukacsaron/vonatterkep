import { QueryClient } from '@tanstack/react-query';
import type { Endpoint, GetEndpoint } from './endpoints';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30 * 1000, // 30 seconds
      gcTime: 5 * 60 * 1000, // 5 minutes
      retry: 3,
      retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    },
  },
});

// NEXT_PUBLIC_API_URL may be set to an origin with or without the /api suffix
// (Coolify has it as "https://vasutterkep.hu"). Normalise so requests always
// land on the API routes rather than on a page route.
export function resolveApiBase(): string {
  const raw = (process.env.NEXT_PUBLIC_API_URL || '').trim().replace(/\/+$/, '');
  if (!raw) return '/api';
  return raw.endsWith('/api') ? raw : `${raw}/api`;
}

const API_BASE_URL = resolveApiBase();

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

/** Everything a caller may set per request. The endpoint owns the method. */
export type ApiRequestOptions = Omit<RequestInit, 'method'>;

/** Absolute (or base-relative) URL an endpoint resolves to. Exported for tests. */
export function endpointUrl(endpoint: Endpoint<unknown>): string {
  return `${API_BASE_URL}${endpoint.path}`;
}

export async function fetcher<TResponse>(
  endpoint: Endpoint<TResponse>,
  options?: ApiRequestOptions
): Promise<TResponse> {
  const url = endpointUrl(endpoint);

  const response = await fetch(url, {
    ...options,
    method: endpoint.method,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    throw new ApiError(response.status, await response.text());
  }

  return response.json() as Promise<TResponse>;
}

export const api = {
  /**
   * Fetch a typed endpoint from `endpoints`. The response type comes from the
   * endpoint definition, so there is nothing for a caller to assert.
   */
  get: <TResponse>(endpoint: GetEndpoint<TResponse>, options?: ApiRequestOptions) =>
    fetcher(endpoint, options),

  /** Same, for endpoints that are not GET. */
  request: <TResponse>(endpoint: Endpoint<TResponse>, options?: ApiRequestOptions) =>
    fetcher(endpoint, options),
};

export { endpoints } from './endpoints';
export type { Endpoint, GetEndpoint, ResponseOf } from './endpoints';
