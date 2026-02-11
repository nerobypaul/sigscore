import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import { config } from './config';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/error';
import authRoutes from './routes/auth';
import contactRoutes from './routes/contacts';
import companyRoutes from './routes/companies';
import dealRoutes from './routes/deals';
import activityRoutes from './routes/activities';
import signalRoutes from './routes/signals';
import signalSourceRoutes from './routes/signal-sources';
import webhookRoutes from './routes/webhooks';

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: config.corsOrigin,
  credentials: true
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: 'Too many requests from this IP, please try again later.'
});
app.use('/api/', limiter);

// Higher rate limit for signal ingest (needs to handle high throughput)
const signalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 500,
  message: 'Signal ingest rate limit exceeded.'
});
app.use('/api/v1/signals', signalLimiter);

// Body parsing
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
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

// API routes — Signal Engine
app.use('/api/v1/signals', signalRoutes);
app.use('/api/v1/sources', signalSourceRoutes);
app.use('/api/v1/webhooks', webhookRoutes);

// Swagger documentation
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(undefined, {
  swaggerOptions: {
    url: '/api/openapi.json'
  }
}));

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// Error handling middleware (must be last)
app.use(errorHandler);

// Start server
const PORT = config.port;
app.listen(PORT, () => {
  logger.info(`DevSignal CRM running on port ${PORT}`);
  logger.info(`Environment: ${config.nodeEnv}`);
  logger.info(`API Documentation: http://localhost:${PORT}/api/docs`);
});

export default app;
