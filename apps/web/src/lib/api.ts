const base =
  import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api/v1";
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, init: RequestInit = {}) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    credentials: "include",
    headers: { "content-type": "application/json", ...(init.headers ?? {}) },
  });
  if (response.status === 204) return undefined as T;
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new ApiError(
      body?.error?.code ?? "REQUEST_FAILED",
      body?.error?.message ?? "Request failed.",
      body?.error?.details,
    );
  return body.data as T;
}
