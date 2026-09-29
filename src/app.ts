import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
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

// ╔══════════════════════════════════════════════════════════════════════════╗
// ║  Manual CORS preflight — catches OPTIONS BEFORE any other middleware    ║
// ║  Nothing can interfere: no helmet, no body-parser, no rate-limit.       ║
// ╚══════════════════════════════════════════════════════════════════════════╝
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.method !== 'OPTIONS') return next();
  const origin = req.headers.origin ?? '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.status(204).end();
  return;
});

// ── Health check — BEFORE CORS so warmup pings always work ───────────────
// This endpoint must respond instantly without touching the database.
// Frontend BackendWarmup component hits this on login page mount to
// pre-warm the Vercel serverless function.
app.get('/health', (_req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*'); // allow any origin for warmup
  ok(res, {
    status: 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

app.get('/', (_req, res) => {
  ok(res, { message: 'ERP Sales & Marketing API' });
});

// ── CORS for actual requests (non-OPTIONS) ────────────────────────────────
// Preflight is handled above.  This adds response headers for the real call.
app.use(
  cors({
    origin: true,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ── Body parsers — enforce hard size limits to prevent payload bloat ───────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// ── Helmet — base security headers for all routes EXCEPT /api-docs*
// The Swagger UI route has its own relaxed helmet config mounted below.
// We skip strict helmet for docs paths because Swagger uses inline scripts,
// eval, and blob: URLs that the global strict CSP would block.
const SWAGGER_PREFIX = '/api-docs';
const strictHelmet = helmet({
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
});
app.use((req, res, next) => {
  if (req.path.startsWith(SWAGGER_PREFIX) || req.path === '/api-docs.json') {
    return next();
  }
  return strictHelmet(req, res, next);
});

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
 * Skipped in test environment to allow test suite logins.
 */
const authLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_AUTH_MAX,
  standardHeaders: true,   // Return RateLimit-* headers
  legacyHeaders: false,
  message: `Too many authentication attempts. Please try again after ${Math.round(env.RATE_LIMIT_WINDOW_MS / 60000)} minutes.`,
  handler: rateLimitHandler,
  skip: (req) => {
    // Skip for test env AND for localhost dev runs (prevents test suite 429s)
    if (env.NODE_ENV === 'test') return true;
    if (env.NODE_ENV !== 'production') {
      const ip = req.ip ?? '';
      if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') return true;
    }
    return false;
  },
  skipSuccessfulRequests: false,
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
//
// CDN-backed implementation — works reliably on Vercel serverless.
//
// Rationale: swagger-ui-express's swaggerUi.serve is express.static pointing
// at swagger-ui-dist inside node_modules. On Vercel's @vercel/node runtime
// the resolved path to those files frequently does not exist in the bundled
// serverless function, so swagger-ui-bundle.js / swagger-ui.css come back as
// ERR_ABORTED and the page stays blank with "ReferenceError: SwaggerUIBundle
// is not defined". We instead serve a tiny hand-rolled HTML page that loads
// Swagger UI directly from the unpkg CDN and fetches our OpenAPI spec from
// /api-docs.json. No static file serving required.
//
// Global strict helmet CSP (mounted above) is SKIPPED for /api-docs* paths;
// the CSP configured here explicitly allows unpkg CDN assets + the inline
// bootstrap script that Swagger UI needs to initialize from our spec URL.
const SWAGGER_UI_CDN = 'https://unpkg.com/swagger-ui-dist@5';
const SWAGGER_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <meta name="description" content="ERP Sales & Marketing API docs" />
    <title>ERP Sales & Marketing API Docs</title>
    <link rel="stylesheet" href="${SWAGGER_UI_CDN}/swagger-ui.css" />
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="${SWAGGER_UI_CDN}/swagger-ui-bundle.js" crossorigin></script>
    <script src="${SWAGGER_UI_CDN}/swagger-ui-standalone-preset.js" crossorigin></script>
    <script>
      window.ui = SwaggerUIBundle({
        url: '/api-docs.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
        plugins: [SwaggerUIBundle.plugins.DownloadUrl],
        layout: 'StandaloneLayout',
        filter: true,
        displayRequestDuration: true,
        persistAuthorization: true,
        tryItOutEnabled: true,
      });
    </script>
  </body>
</html>`;
app.use(
  '/api-docs',
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
          'https://unpkg.com',
        ],
        scriptSrcAttr: ["'unsafe-inline'"],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://fonts.googleapis.com',
          'https://unpkg.com',
        ],
        imgSrc: ["'self'", 'data:', 'https:'],
        fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:', 'https://unpkg.com'],
        connectSrc: ["'self'", 'https:'],
        workerSrc: ["'self'", 'blob:'],
      },
    },
    hsts: { maxAge: 31536000, includeSubDomains: true },
    noSniff: false,
    xssFilter: true,
  }),
);
// /api-docs/ (trailing slash) → HTML
app.get('/api-docs/', (_req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(SWAGGER_HTML);
});
// /api-docs (no trailing slash) → redirect to /api-docs/
app.get('/api-docs', (_req, res) => {
  res.redirect('/api-docs/');
});

// ── JSON spec endpoint (useful for code-gen tools + Swagger UI fetch) ─────
app.get('/api-docs.json', (_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
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
