import type { NextFunction, Request, Response } from 'express';

/**
 * Express 4 does not catch rejected promises from async handlers — an
 * uncaught rejection there crashes the entire process (took down every
 * user's session during dev when a single malformed PDF triggered one).
 * Wrap every async route handler with this so errors reach the error
 * middleware instead.
 */
export function asyncHandler<T extends Request = Request>(
  fn: (req: T, res: Response, next: NextFunction) => Promise<unknown>,
) {
  return (req: T, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}
