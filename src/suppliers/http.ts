import { isAllowed, parseRobots, type RobotsRules } from "../domain/robots";

/** Who we are, so a store can see and reach us. */
export const SYNC_USER_AGENT = "COTS-IL-catalog-sync/1.0 (+https://cots-il.vercel.app)";

const MAX_ATTEMPTS = 4;
const MAX_CONSECUTIVE_429 = 3;
const TIMEOUT_MS = 30_000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class RateLimitedError extends Error {}
export class DisallowedError extends Error {}

export type Answer = { status: number; body: string };

/**
 * One store, one request at a time, at least `minIntervalMs` from one request's start to the
 * next (or the store's Crawl-delay, if longer). Retries 429 and 5xx with backoff; gives up on
 * the whole run after a few 429s in a row, since the store is telling us to stop.
 */
export class PoliteClient {
  private last = 0;
  private consecutive429 = 0;
  private rules: RobotsRules | null = null;
  requests = 0;

  constructor(
    private readonly baseUrl: string,
    private minIntervalMs = 1000,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly wait: (ms: number) => Promise<void> = sleep,
  ) {}

  /** Reads robots.txt once; a store without one allows everything. */
  async loadRobots(): Promise<RobotsRules> {
    const answer = await this.send(`${this.baseUrl}/robots.txt`, {}, false);
    this.rules = parseRobots(answer.status === 200 ? answer.body : "", SYNC_USER_AGENT);
    if (this.rules.crawlDelaySeconds) this.minIntervalMs = Math.max(this.minIntervalMs, this.rules.crawlDelaySeconds * 1000);
    return this.rules;
  }

  allowed(url: string): boolean {
    if (!this.rules) return true;
    const u = new URL(url);
    return isAllowed(this.rules, `${u.pathname}${u.search}`);
  }

  get(url: string): Promise<Answer> {
    return this.send(url, { headers: { accept: "text/html,application/xhtml+xml,application/xml" } });
  }

  postForm(url: string, form: URLSearchParams): Promise<Answer> {
    return this.send(url, {
      method: "POST",
      body: form.toString(),
      headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded; charset=UTF-8", "x-requested-with": "XMLHttpRequest" },
    });
  }

  private async send(url: string, init: RequestInit, checkRobots = true): Promise<Answer> {
    if (checkRobots && !this.allowed(url)) throw new DisallowedError(`robots.txt disallows ${new URL(url).pathname}`);
    for (let attempt = 1; ; attempt++) {
      const gap = this.last + this.minIntervalMs - Date.now();
      if (gap > 0) await this.wait(gap);
      this.last = Date.now();
      this.requests++;
      let response: Response;
      try {
        response = await this.fetchImpl(url, { ...init, redirect: "follow", headers: { "user-agent": SYNC_USER_AGENT, ...init.headers }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      } catch (error) {
        if (attempt >= MAX_ATTEMPTS) throw error;
        await this.wait(5000 * 2 ** (attempt - 1));
        continue;
      }
      if (response.status === 429) {
        this.consecutive429++;
        if (this.consecutive429 >= MAX_CONSECUTIVE_429) throw new RateLimitedError(`Rate-limited by ${new URL(url).host} after ${this.requests} requests`);
      } else this.consecutive429 = 0;
      const retryable = response.status === 429 || response.status >= 500;
      if (!retryable || attempt >= MAX_ATTEMPTS) return { status: response.status, body: await response.text() };
      await response.body?.cancel();
      const retryAfter = Number(response.headers.get("retry-after"));
      await this.wait(retryAfter > 0 ? Math.min(retryAfter, 120) * 1000 : 5000 * 2 ** (attempt - 1));
    }
  }
}
