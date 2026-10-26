/** SMS provider abstraction — the absenteeism job never talks to a vendor directly. */
export interface SmsProvider {
  readonly name: string;
  send(to: string, message: string): Promise<void>;
}

/** Test/dev provider: records messages instead of sending them. */
export class MockSmsProvider implements SmsProvider {
  readonly name = 'mock';
  readonly sent: { to: string; message: string }[] = [];

  async send(to: string, message: string): Promise<void> {
    this.sent.push({ to, message });
  }
}

export interface AfricasTalkingConfig {
  username: string;
  apiKey: string;
  /** true → sandbox host (free test credits); false → production host. */
  sandbox: boolean;
}

/**
 * Africa's Talking bulk SMS — a real gateway with African coverage including
 * Zimbabwe and South Africa. Sandbox mode uses free test credits.
 */
export class AfricasTalkingSmsProvider implements SmsProvider {
  readonly name = 'africastalking';

  constructor(
    private readonly config: AfricasTalkingConfig,
    private readonly fetcher: typeof fetch = fetch,
  ) {}

  private get endpoint(): string {
    return this.config.sandbox
      ? 'https://api.sandbox.africastalking.com/version1/messaging'
      : 'https://api.africastalking.com/version1/messaging';
  }

  async send(to: string, message: string): Promise<void> {
    const response = await this.fetcher(this.endpoint, {
      method: 'POST',
      headers: {
        apiKey: this.config.apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        username: this.config.username,
        to: [to],
        message,
      }),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Africa's Talking SMS failed (${response.status}): ${body.slice(0, 200)}`);
    }
  }
}

export function smsProviderFromEnv(env: NodeJS.ProcessEnv = process.env): SmsProvider {
  const provider = env.SMS_PROVIDER ?? 'mock';
  if (provider === 'africastalking') {
    const username = env.AT_USERNAME;
    const apiKey = env.AT_API_KEY;
    if (!username || !apiKey) {
      throw new Error('AT_USERNAME and AT_API_KEY are required when SMS_PROVIDER=africastalking');
    }
    return new AfricasTalkingSmsProvider({
      username,
      apiKey,
      sandbox: env.AT_SANDBOX !== 'false',
    });
  }
  return new MockSmsProvider();
}
