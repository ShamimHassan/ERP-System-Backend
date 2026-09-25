import { type JwtUserPayload } from '../config/jwt';

declare global {
  namespace Express {
    interface Request {
      user?: JwtUserPayload & { role: import('@prisma/client').Role };
      visibleUserIds?: string[] | null;
    }
  }
}
