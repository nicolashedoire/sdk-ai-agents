import { ValidationError } from '../errors/index.js';

/** The longest wait a timer takes (about 24.8 days): a longer one would fire at once. */
export const MAX_VENDOR_TIMEOUT_MS = 2_147_483_647;

/**
 * Checks a vendor client `timeout` given as a plain value (a JSON configuration, JavaScript
 * code): a number of milliseconds above 0 that a timer can wait. `path` names it in the error.
 */
export function assertVendorTimeout(timeout: unknown, path: string): void {
  if (timeout === undefined) return;
  if (
    typeof timeout !== 'number' ||
    !Number.isFinite(timeout) ||
    timeout <= 0 ||
    timeout > MAX_VENDOR_TIMEOUT_MS
  ) {
    const shown = typeof timeout === 'string' ? JSON.stringify(timeout) : String(timeout);
    throw new ValidationError(
      path,
      `must be a number of milliseconds above 0 and at most ${MAX_VENDOR_TIMEOUT_MS}, got ${shown}`
    );
  }
}
