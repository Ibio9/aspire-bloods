import type { NextFunction, Request, Response } from 'express';
import type { UserRole } from '@aspire-bloods/shared';

export function roleGuard(...allowed: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !allowed.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    return next();
  };
}
