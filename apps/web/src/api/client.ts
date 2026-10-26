/** Wraps an authenticated fetch: bearer token injection and typed JSON. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body?: unknown,
  ) {
    super(`API request failed with status ${status}`);
    this.name = 'ApiError';
  }
}

export interface TokenProvider {
  getAccessToken(): Promise<string | undefined>;
  /** When set, requests carry X-Tenant-Id so multi-school staff can switch. */
  getActiveTenant?(): string | undefined;
}

export class ApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly tokens: TokenProvider,
  ) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = await this.tokens.getAccessToken();
    const activeTenant = this.tokens.getActiveTenant?.();
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (token !== undefined) {
      headers.authorization = `Bearer ${token}`;
    }
    if (activeTenant !== undefined && activeTenant !== '') {
      headers['x-tenant-id'] = activeTenant;
    }
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => undefined);
      throw new ApiError(response.status, errorBody);
    }
    if (response.status === 204) {
      return undefined as T;
    }
    return (await response.json()) as T;
  }

  get<T>(path: string): Promise<T> {
    return this.request<T>('GET', path);
  }

  /** Raw file download — used for avatar/material images and CSV exports. */
  async getBlob(path: string): Promise<Blob> {
    const token = await this.tokens.getAccessToken();
    const headers: Record<string, string> = {};
    if (token !== undefined) {
      headers.authorization = `Bearer ${token}`;
    }
    const response = await fetch(`${this.baseUrl}${path}`, { headers });
    if (!response.ok) {
      const errorBody = await response.json().catch(() => undefined);
      throw new ApiError(response.status, errorBody);
    }
    return response.blob();
  }

  post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('POST', path, body);
  }

  patch<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>('PATCH', path, body);
  }

  delete<T>(path: string): Promise<T> {
    return this.request<T>('DELETE', path);
  }
}
