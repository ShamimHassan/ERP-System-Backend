import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import { env } from './config/env';
import { fail, ok } from './lib/response';
import { swaggerSpec } from './docs/swagger';
import authRoutes from './modules/auth/auth.routes';
import usersRoutes from './modules/users/users.routes';
import servicesRoutes from './modules/catalog/services.routes';
import categoriesRoutes from './modules/catalog/categories.routes';
import productsRoutes from './modules/catalog/products.routes';
import pricesRoutes from './modules/catalog/prices.routes';
import leadsRoutes from './modules/leads/leads.routes';
import customersRoutes from './modules/customers/customers.routes';
import opportunitiesRoutes from './modules/opportunities/opportunities.routes';
import activitiesRoutes from './modules/activities/activities.routes';
import surveysRoutes from './modules/surveys/surveys.routes';
import quotationsRoutes from './modules/quotations/quotations.routes';
import salesOrdersRoutes from './modules/sales-orders/sales-orders.routes';
import dashboardRoutes from './modules/dashboard/dashboard.routes';
import kpisRoutes from './modules/kpis/kpis.routes';
import reportsRoutes from './modules/reports/reports.routes';
import auditLogsRoutes from './modules/audit-logs/audit-logs.routes';
import { authenticate, authorize, scopeData } from './middleware/auth';

const app = express();

app.set('trust proxy', 1);

// ── CORS ── whitelist only — no wildcard ───────────────────────────────────
app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// ── Helmet — base security headers for all routes ─────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc:  ["'self'"],
        styleSrc:   ["'self'"],
        imgSrc:     ["'self'", 'data:'],
        fontSrc:    ["'self'"],
        connectSrc: ["'self'"],
        frameSrc:   ["'none'"],
        objectSrc:  ["'none'"],
      },
    },
    hsts: { maxAge: 31536000, includeSubDomains: true },
    noSniff: true,
    xssFilter: true,
  })
);

app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ── Body parsers — enforce hard size limits to prevent payload bloat ───────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ══════════════════════════════════════════════════════════════════════════
// RATE LIMITERS
// ══════════════════════════════════════════════════════════════════════════

/** Standard 429 response matching the API envelope */
const rateLimitHandler = (
  _req: Request,
  res: Response,
  _next: NextFunction,
  options: { message: string }
) => {
  fail(res, 429, {
    code: 'TOO_MANY_REQUESTS',
    message: options.message,
  });
};

/**
 * Auth rate limiter — strict: 10 requests / 15 min per IP.
 * Covers login + refresh endpoints to slow brute-force attacks.
 */
const authLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_AUTH_MAX,
  standardHeaders: true,   // Return RateLimit-* headers
  legacyHeaders: false,
  message: `Too many authentication attempts. Please try again after ${Math.round(env.RATE_LIMIT_WINDOW_MS / 60000)} minutes.`,
  handler: rateLimitHandler,
  skipSuccessfulRequests: false, // count ALL attempts including successful ones
});

/**
 * General API rate limiter — generous: 500 requests / 15 min per IP.
 * Applied to all /api/* routes except auth (which has its own stricter limiter).
 */
const apiLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_API_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  message: `API rate limit exceeded. Please try again after ${Math.round(env.RATE_LIMIT_WINDOW_MS / 60000)} minutes.`,
  handler: rateLimitHandler,
  skip: (req) => req.path.startsWith('/api-docs'), // never rate-limit docs
});

// Apply auth limiter to login + refresh only
app.use('/api/auth/login',   authLimiter);
app.use('/api/auth/refresh', authLimiter);

// Apply general limiter to all /api/* routes
app.use('/api', apiLimiter);

// ── Swagger UI — /api-docs ─────────────────────────────────────────────────
// Use a custom helmet config for the docs route to allow inline scripts/styles
app.use(
  '/api-docs',
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        imgSrc: ["'self'", 'data:', 'https:'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      },
    },
  }),
  swaggerUi.serve,
  swaggerUi.setup(swaggerSpec, {
    customSiteTitle: 'ERP Sales & Marketing API Docs',
    swaggerOptions: { persistAuthorization: true },
  })
);

// ── JSON spec endpoint (useful for code-gen tools) ─────────────────────────
app.get('/api-docs.json', (_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

app.get('/health', (_req, res) => {
  ok(res, {
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.get('/', (_req, res) => {
  ok(res, { message: 'Hello World from ERP Backend!' });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/services', servicesRoutes);
app.use('/api/categories', categoriesRoutes);
app.use('/api/products', productsRoutes);
app.use('/api/products/:productId/prices', pricesRoutes);
app.use('/api/leads', leadsRoutes);
app.use('/api/customers', customersRoutes);
app.use('/api/opportunities', opportunitiesRoutes);
app.use('/api/activities', activitiesRoutes);
app.use('/api/surveys', surveysRoutes);
app.use('/api/quotations', quotationsRoutes);
app.use('/api/sales-orders', salesOrdersRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/kpis', kpisRoutes);
app.use('/api/reports', reportsRoutes);
app.use('/api/audit-logs', auditLogsRoutes);

app.get('/api/test/any-authenticated', authenticate, (_req, res) => {
  ok(res, { message: 'Any authenticated user can see this', user: _req.user });
});

app.get(
  '/api/test/admin-only',
  authenticate,
  authorize(['ADMIN']),
  (_req, res) => {
    ok(res, { message: 'Admin only content' });
  }
);

app.get(
  '/api/test/marketing-only',
  authenticate,
  authorize(['MARKETING']),
  (_req, res) => {
    ok(res, { message: 'Marketing only content' });
  }
);

app.get(
  '/api/test/scoped',
  authenticate,
  scopeData(),
  (_req, res) => {
    ok(res, {
      message: 'Scoped data view',
      role: _req.user?.role,
      visibleUserIds: _req.visibleUserIds,
    });
  }
);

app.use((_req, res) => {
  fail(res, 404, {
    code: 'NOT_FOUND',
    message: 'The requested resource was not found',
  });
});

app.use(
  (
    err: unknown,
    _req: Request,
    res: Response,
    _next: NextFunction
  ) => {
    if (err instanceof SyntaxError && 'body' in err) {
      return fail(res, 400, {
        code: 'INVALID_JSON',
        message: 'Invalid JSON payload',
        details: err.message,
      });
    }

    const error =
      err instanceof Error
        ? err
        : new Error(err ? String(err) : 'Unknown error');

    const statusCode =
      res.statusCode && res.statusCode >= 400 ? res.statusCode : 500;

    if (env.NODE_ENV !== 'production') {
      console.error('[ERROR]', error.stack || error.message);
    }

    fail(res, statusCode, {
      code:
        statusCode === 500 ? 'INTERNAL_SERVER_ERROR' : 'BAD_REQUEST',
      message:
        statusCode === 500
          ? 'An unexpected error occurred'
          : error.message,
      details: env.NODE_ENV !== 'production' ? error.stack : undefined,
    });
  }
);

export default app;
