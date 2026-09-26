import express, {
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env';
import { fail, ok } from './lib/response';
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
import { authenticate, authorize, scopeData } from './middleware/auth';

const app = express();

app.set('trust proxy', 1);

app.use(
  cors({
    origin: env.CORS_ORIGIN,
    credentials: true,
  })
);
app.use(helmet());
app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

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
