import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import { config } from './config';
import { swaggerSpec } from './config/swagger';
import { errorHandler } from './middleware/error';
import authRoutes from './routes/auth';
import contactRoutes from './routes/contacts';
import companyRoutes from './routes/companies';
import dealRoutes from './routes/deals';
import activityRoutes from './routes/activities';
import signalRoutes from './routes/signals';
import signalSourceRoutes from './routes/signal-sources';
import webhookRoutes from './routes/webhooks';
import apiKeyRoutes from './routes/api-keys';
import customObjectRoutes from './routes/custom-objects';
import aiRoutes from './routes/ai';

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: config.corsOrigin,
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Stricter rate limiter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 15,
  message: 'Too many authentication attempts, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/v1/auth/login', authLimiter);
app.use('/api/v1/auth/register', authLimiter);

// Higher rate limit for signal ingest (needs to handle high throughput)
const signalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 500,
  message: 'Signal ingest rate limit exceeded.',
});
app.use('/api/v1/signals', signalLimiter);

// Body parsing
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'devsignal-crm',
    timestamp: new Date().toISOString(),
    version: '0.2.0',
  });
});

// API routes — Core CRM
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/contacts', contactRoutes);
app.use('/api/v1/companies', companyRoutes);
app.use('/api/v1/deals', dealRoutes);
app.use('/api/v1/activities', activityRoutes);
app.use('/api/v1/api-keys', apiKeyRoutes);

// API routes — Signal Engine
app.use('/api/v1/signals', signalRoutes);
app.use('/api/v1/sources', signalSourceRoutes);
app.use('/api/v1/webhooks', webhookRoutes);

// API routes — Custom Objects
app.use('/api/v1/objects', customObjectRoutes);

// API routes — AI Engine
app.use('/api/v1/ai', aiRoutes);

// Swagger / OpenAPI documentation

// Raw JSON spec endpoints
app.get('/api-docs.json', (_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});
app.get('/api/openapi.json', (_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

// Swagger UI at /api-docs (primary) and /api/docs (legacy)
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'DevSignal CRM API Docs',
}));
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'DevSignal CRM API Docs',
}));

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// Error handling middleware (must be last)
app.use(errorHandler);

export default app;
