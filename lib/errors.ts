import "server-only";
import type { ErrorCode, PublicError } from "@/lib/types/conversation";

/** An error whose message is safe to show users: it never holds upstream text or secrets. */
export class ServiceError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public retryable = false,
  ) {
    super(message);
    this.name = "ServiceError";
  }
}

export function toPublicError(err: unknown): PublicError {
  if (err instanceof ServiceError) {
    return { code: err.code, message: err.message, retryable: err.retryable };
  }
  console.error("Unexpected pipeline error:", err instanceof Error ? err.name : "unknown");
  return {
    code: "UPSTREAM",
    message: "Something went wrong on the server. Please try again.",
    retryable: true,
  };
}

/** fetch with a timeout, turning transport failures into ServiceErrors. */
export async function fetchUpstream(
  service: string,
  url: string,
  init: RequestInit,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<Response> {
  const timeout = AbortSignal.timeout(timeoutMs);
  try {
    return await fetch(url, {
      ...init,
      cache: "no-store",
      signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
    });
  } catch (err) {
    if (timeout.aborted) {
      throw new ServiceError("TIMEOUT", `${service} took too long to respond.`, true);
    }
    if (signal?.aborted) throw err;
    throw new ServiceError("NETWORK", `Could not reach ${service}. Check your connection.`, true);
  }
}

/**
 * A failure from the provider's CDN edge rather than its API: 502/503/504/52x,
 * or any error status served as an HTML page (Gnani sits behind Cloudflare and
 * intermittently answers with HTML 504 and 403 pages that succeed on retry).
 */
export function isGatewayError(res: Response) {
  if ([502, 503, 504, 520, 521, 522, 523, 524].includes(res.status)) return true;
  return !res.ok && (res.headers.get("content-type") ?? "").includes("text/html");
}

/** fetchUpstream that retries gateway errors with a short backoff. Use only for idempotent calls. */
export async function fetchUpstreamWithRetry(
  service: string,
  url: string,
  init: RequestInit,
  timeoutMs: number,
  signal?: AbortSignal,
  retries = 2,
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetchUpstream(service, url, init, timeoutMs, signal);
    if (!isGatewayError(res) || attempt >= retries) return res;
    console.warn(`${service}: gateway error ${res.status}, retrying (${attempt + 1}/${retries})`);
    await res.body?.cancel();
    await new Promise((resolve) => setTimeout(resolve, 500 * (attempt + 1)));
    if (signal?.aborted) return res;
  }
}

export function gatewayError(service: string) {
  return new ServiceError("UPSTREAM", `${service} is busy right now (its server gateway did not respond). Please retry.`, true);
}

/** Maps the auth/rate-limit statuses every service shares. Returns null for anything else. */
export function commonStatusError(service: string, status: number, keyVar: string) {
  switch (status) {
    case 401:
      return new ServiceError("INVALID_CREDENTIALS", `${service} rejected the API key. Check ${keyVar} in .env.local.`);
    case 402:
      return new ServiceError("INSUFFICIENT_CREDIT", `${service} account is out of credit.`);
    case 403:
      return new ServiceError("FORBIDDEN", `The ${keyVar} key does not have access to ${service}.`);
    case 429:
      return new ServiceError("RATE_LIMITED", `${service} is rate limiting requests. Wait a moment and retry.`, true);
    default:
      return null;
  }
}
