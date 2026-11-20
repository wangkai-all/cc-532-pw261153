import type { ApiErrorBody } from '../types';

export class ApiError extends Error {
  code: string;
  details: unknown;
  status: number;
  constructor(status: number, body: ApiErrorBody) {
    super(body?.error || '请求失败');
    this.status = status;
    this.code = body?.code || 'UNKNOWN';
    this.details = body?.details ?? null;
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    throw new ApiError(res.status, (json as ApiErrorBody) ?? { error: `HTTP ${res.status}`, code: 'HTTP' });
  }
  return json as T;
}

export const api = {
  get: <T>(url: string) => request<T>('GET', url),
  post: <T>(url: string, body?: unknown) => request<T>('POST', url, body),
  patch: <T>(url: string, body?: unknown) => request<T>('PATCH', url, body)
};
