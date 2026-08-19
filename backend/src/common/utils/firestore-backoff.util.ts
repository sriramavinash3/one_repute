import { Logger } from '@nestjs/common';

export function isFirestoreQuotaOrTransientError(err: any): boolean {
  if (!err) return false;
  const msg = String(err.message || '').toUpperCase();
  const code = String(err.code || '').toUpperCase();
  const status = err.status || err.statusCode;

  return (
    code === 'RESOURCE_EXHAUSTED' ||
    code === '8' ||
    code === 'UNAVAILABLE' ||
    code === '14' ||
    code === 'DEADLINE_EXCEEDED' ||
    code === '4' ||
    status === 429 ||
    status === 503 ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('QUOTA EXCEEDED') ||
    msg.includes('TOO MANY REQUESTS') ||
    msg.includes('RATE LIMIT') ||
    msg.includes('UNAVAILABLE')
  );
}

export interface BackoffOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  loggerContext?: string;
}

export async function withFirestoreBackoff<T>(
  fn: () => Promise<T>,
  options: BackoffOptions = {},
): Promise<T> {
  const maxRetries = options.maxRetries ?? 3;
  const initialDelay = options.initialDelayMs ?? 500;
  const maxDelay = options.maxDelayMs ?? 8000;
  const logger = new Logger(options.loggerContext || 'FirestoreBackoff');

  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err: any) {
      attempt++;
      if (attempt > maxRetries || !isFirestoreQuotaOrTransientError(err)) {
        throw err;
      }

      const backoffMs = Math.min(
        initialDelay * Math.pow(2, attempt - 1) + Math.floor(Math.random() * 200),
        maxDelay,
      );
      logger.warn(
        `Firestore error (${err.code || err.message}). Retrying attempt ${attempt}/${maxRetries} in ${backoffMs}ms...`,
      );
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }
}
