import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClient, ApiError } from './client';

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

describe('ApiClient', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('attaches the bearer token from the token provider', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new ApiClient('https://api.example.com', {
      getAccessToken: async () => 'tok-1',
    });
    await client.get('/learners');

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.example.com/learners');
    const headers = init.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer tok-1');
    expect(headers['content-type']).toBe('application/json');
  });

  it('serializes JSON bodies on POST', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ learnerId: 'l-1' }, 201));
    vi.stubGlobal('fetch', fetchMock);

    const client = new ApiClient('https://api.example.com', {
      getAccessToken: async () => 'tok-1',
    });
    const created = await client.post<{ learnerId: string }>('/learners', {
      firstName: 'Tendai',
    });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ firstName: 'Tendai' }));
    expect(created.learnerId).toBe('l-1');
  });

  it('raises ApiError with status and body on failures', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ error: 'forbidden' }, 403));
    vi.stubGlobal('fetch', fetchMock);

    const client = new ApiClient('https://api.example.com', {
      getAccessToken: async () => 'tok-1',
    });

    const error = await client.get('/reports/summary?month=202601').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(403);
    expect((error as ApiError).body).toEqual({ error: 'forbidden' });
  });

  it('omits the authorization header when no token is available', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ status: 'ok' }));
    vi.stubGlobal('fetch', fetchMock);

    const client = new ApiClient('https://api.example.com', {
      getAccessToken: async () => undefined,
    });
    await client.get('/health');

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).authorization).toBeUndefined();
  });
});
