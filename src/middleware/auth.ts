import { type NextFunction, type Request, type Response } from 'express';
import { verifyAccessToken } from '../config/jwt';
import { fail } from '../lib/response';
import type { Role } from '@prisma/client';

export function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return fail(res, 401, {
      code: 'UNAUTHORIZED',
      message: 'Missing or invalid Authorization header',
    });
  }

  const token = header.slice(7);
  try {
    const payload = verifyAccessToken(token);
    req.user = {
      id: payload.id,
      role: payload.role as Role,
      managerId: payload.managerId ?? null,
    };
    return next();
  } catch (err) {
    const message =
      err instanceof Error && err.name === 'TokenExpiredError'
        ? 'Access token expired'
        : 'Invalid access token';
    return fail(res, 401, {
      code: 'INVALID_TOKEN',
      message,
    });
  }
}

export function authorize(allowedRoles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return fail(res, 401, {
        code: 'UNAUTHORIZED',
        message: 'Authentication required',
      });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return fail(res, 403, {
        code: 'FORBIDDEN',
        message: `Role ${req.user.role} is not allowed to access this resource`,
      });
    }
    return next();
  };
}
