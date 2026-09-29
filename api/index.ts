/**
 * api/index.ts — Vercel serverless entry point
 *
 * Wraps the Express app as a Vercel serverless function.
 * All requests to /* are routed here via vercel.json.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node';
import app from '../src/app';

export default function handler(req: VercelRequest, res: VercelResponse) {
  // Delegate to the Express app
  return app(req as unknown as Parameters<typeof app>[0], res as unknown as Parameters<typeof app>[1]);
}
