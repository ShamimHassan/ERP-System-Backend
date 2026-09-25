import jwt from 'jsonwebtoken';
import { env } from './env';

export interface JwtUserPayload {
  id: string;
  role: 'ADMIN' | 'MANAGER' | 'MARKETING';
  managerId?: string | null;
}

const accessSignOpts = {
  algorithm: 'HS256' as const,
  expiresIn: env.JWT_ACCESS_TTL as unknown as jwt.SignOptions['expiresIn'],
};

const refreshSignOpts = {
  algorithm: 'HS256' as const,
  expiresIn: env.JWT_REFRESH_TTL as unknown as jwt.SignOptions['expiresIn'],
};

export function signAccessToken(payload: JwtUserPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, accessSignOpts);
}

export function signRefreshToken(payload: JwtUserPayload): string {
  return jwt.sign(payload, env.JWT_REFRESH_SECRET, refreshSignOpts);
}

export function verifyAccessToken(token: string): JwtUserPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtUserPayload;
}

export function verifyRefreshToken(token: string): JwtUserPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as JwtUserPayload;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export function signTokenPair(payload: JwtUserPayload): TokenPair {
  return {
    accessToken: signAccessToken(payload),
    refreshToken: signRefreshToken(payload),
  };
}
