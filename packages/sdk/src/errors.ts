/**
 * Base error class for all DevSignal SDK errors.
 *
 * Thrown when the API returns a non-2xx response or when the request
 * fails at the network level.
 */
export class DevSignalError extends Error {
  public override readonly name = 'DevSignalError';

  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
  ) {
    super(message);

    // Maintains proper stack trace in V8 environments
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DevSignalError);
    }
  }
}
