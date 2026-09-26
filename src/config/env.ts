import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),
  PORT: z.coerce.number().default(4000),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  JWT_ACCESS_SECRET: z.string().min(8, 'JWT_ACCESS_SECRET must be at least 8 chars'),
  JWT_REFRESH_SECRET: z.string().min(8, 'JWT_REFRESH_SECRET must be at least 8 chars'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(4).max(31).default(12),
  // Rate limiting — per-IP, rolling window
  RATE_LIMIT_WINDOW_MS:  z.coerce.number().int().positive().default(15 * 60 * 1000), // 15 min
  RATE_LIMIT_AUTH_MAX:   z.coerce.number().int().positive().default(10),   // auth endpoints
  RATE_LIMIT_API_MAX:    z.coerce.number().int().positive().default(500),  // general API
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  const issues = parsed.error.issues
    .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
    .join('\n');
  console.error(`❌ Invalid environment variables:\n${issues}`);
  process.exit(1);
}

export const env = parsed.data;

export type Env = typeof env;
