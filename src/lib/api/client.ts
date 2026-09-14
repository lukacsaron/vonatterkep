import { QueryClient } from '@tanstack/react-query';

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
function resolveApiBase(): string {
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

export async function fetcher<T>(
  endpoint: string,
  options?: RequestInit
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (!response.ok) {
    throw new ApiError(response.status, await response.text());
  }

  return response.json() as Promise<T>;
}

export const api = {
  get: <T>(endpoint: string) => fetcher<T>(endpoint),
  
  post: <T>(endpoint: string, data: unknown) =>
    fetcher<T>(endpoint, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
    
  put: <T>(endpoint: string, data: unknown) =>
    fetcher<T>(endpoint, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
    
  delete: <T>(endpoint: string) =>
    fetcher<T>(endpoint, {
      method: 'DELETE',
    }),
};