import type { Response } from 'express';

export interface ApiMeta {
  page?: number;
  limit?: number;
  total?: number;
  totalPages?: number;
  [key: string]: unknown;
}

export interface ApiError {
  code: string;
  message: string;
  details?: unknown;
}

export function ok<T>(res: Response, data: T, meta?: ApiMeta) {
  res.json({ success: true, data, meta });
}

export function fail(
  res: Response,
  code: number,
  error: ApiError
) {
  res.status(code).json({ success: false, error });
}
