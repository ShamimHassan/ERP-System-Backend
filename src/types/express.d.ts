import { type JwtUserPayload } from '../config/jwt';

declare global {
  namespace Express {
    interface Request {
      user?: JwtUserPayload;
    }
  }
}
