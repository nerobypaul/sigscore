import express from 'express';
import compression from 'compression';
import cors from 'cors';
import helmet from 'helmet';
import swaggerUi from 'swagger-ui-express';
import { config } from './config';
import { swaggerSpec } from './config/swagger';
import { errorHandler } from './middleware/error';
import {
  authLimiter,
  apiLimiter,
  webhookLimiter,
  demoLimiter,
  signalLimiter,
  graphqlLimiter,
} from './middleware/rate-limit';
import authRoutes from './routes/auth';
import organizationRoutes from './routes/organizations';
import contactRoutes from './routes/contacts';
import companyRoutes from './routes/companies';
import dealRoutes from './routes/deals';
import activityRoutes from './routes/activities';
import signalRoutes from './routes/signals';
import signalSourceRoutes from './routes/signal-sources';
import webhookRoutes from './routes/webhooks';
import githubWebhookRoutes from './routes/github-webhook';
import apiKeyRoutes from './routes/api-keys';
import customObjectRoutes from './routes/custom-objects';
import aiRoutes from './routes/ai';
import csvImportRoutes from './routes/csv-import';
import slackSettingsRoutes from './routes/slack-settings';
import searchRoutes from './routes/search';
import usageRoutes from './routes/usage';
import billingRoutes, { billingWebhookRouter } from './routes/billing';
import analyticsRoutes from './routes/analytics';
import workflowRoutes from './routes/workflows';
import connectorRoutes from './routes/connectors';
import segmentWebhookRoutes from './routes/segment-webhook';
import slackInteractionsRoutes from './routes/slack-interactions';
import bulkRoutes from './routes/bulk';
import notificationRoutes from './routes/notifications';
import memberRoutes from './routes/members';
import auditRoutes from './routes/audit';
import savedViewRoutes from './routes/saved-views';
import workerRoutes from './routes/workers';
import demoRoutes from './routes/demo';
import emailSequenceRoutes from './routes/email-sequences';
import dashboardApiRoutes from './routes/dashboards';
import crmImportRoutes from './routes/crm-import';
import hubspotSyncRoutes from './routes/hubspot-sync';
import salesforceSyncRoutes from './routes/salesforce-sync';
import githubOnboardingRoutes from './routes/github-onboarding';
import playbookRoutes from './routes/playbooks';
import scoringRoutes from './routes/scoring';
import identityRoutes from './routes/identity';
import discordConnectorRoutes from './routes/discord-connector';
import stackoverflowConnectorRoutes from './routes/stackoverflow-connector';
import twitterConnectorRoutes from './routes/twitter-connector';
import redditConnectorRoutes from './routes/reddit-connector';
import posthogConnectorRoutes from './routes/posthog-connector';
import linkedinConnectorRoutes from './routes/linkedin-connector';
import intercomConnectorRoutes from './routes/intercom-connector';
import zendeskConnectorRoutes from './routes/zendesk-connector';
import ssoRoutes from './routes/sso';
import oauthRoutes from './routes/oauth';
import enrichmentRoutes from './routes/enrichment';
import enrichmentQueueRoutes from './routes/enrichment-queue';
import webhookSubscriptionRoutes from './routes/webhook-subscriptions';
import advancedAnalyticsRoutes from './routes/advanced-analytics';
import apiUsageRoutes from './routes/api-usage';
import customFieldRoutes from './routes/custom-fields';
import scoreSnapshotRoutes from './routes/score-snapshots';
import dataExportRoutes from './routes/data-export';
import accountAlertRoutes from './routes/account-alerts';
import accountReportRoutes, { accountReportsPublicRouter } from './routes/account-reports';
import invitationRoutes from './routes/invitations';
import healthRoutes from './routes/health';
import seoRoutes from './routes/seo';
import changelogRoutes from './routes/changelog';
import anomalyRoutes from './routes/anomalies';
import signalPatternRoutes from './routes/signal-patterns';
import { apiUsageTracker } from './middleware/api-usage';
import { requestIdMiddleware } from './middleware/request-id';
import { sentryErrorHandler } from './utils/sentry';

const app = express();

// Trust Railway/proxy X-Forwarded-For headers for rate limiting and IP detection
app.set('trust proxy', 1);

// Request ID tracing — assign early so every middleware and handler can access it
app.use(requestIdMiddleware);

// Response compression (gzip/deflate) — before all other middleware
app.use(compression());

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'script-src': ["'self'", 'https://plausible.io'],
    },
  },
}));
app.use((_req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});
app.use(cors({
  origin: config.corsOrigin,
  credentials: true
}));

// Rate limiting — see middleware/rate-limit.ts for configuration
app.use('/api/', apiLimiter);

// Stricter rate limiter for auth endpoints (5 req/min)
app.use('/api/v1/auth/login', authLimiter);
app.use('/api/v1/auth/register', authLimiter);
app.use('/api/v1/auth/forgot-password', authLimiter);

// Webhook limiter (200 req/min) — applied before individual webhook routes
app.use('/api/v1/webhooks', webhookLimiter);

// Demo seed limiter (10 req/min) — prevent abuse while allowing Show HN traffic
app.use('/api/v1/demo', demoLimiter);

// GraphQL limiter (30 req/min) — stricter than API to prevent batch query abuse
app.use('/api/v1/graphql', graphqlLimiter);

// Higher rate limit for signal ingest (500 req/min)
app.use('/api/v1/signals', signalLimiter);

// Stripe webhook — must be mounted BEFORE express.json() so the raw body
// is available for signature verification.
app.use('/api/v1/billing/webhook', billingWebhookRouter);

// Body parsing
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));

// API usage tracking — lightweight middleware to record per-org request metrics
// Must be early in the chain to capture all API requests, but after body parsing.
app.use(apiUsageTracker);

// Health check (liveness + readiness probes)
app.use('/health', healthRoutes);

// SEO — sitemap.xml and robots.txt (must be before API routes)
app.use(seoRoutes);

// Public changelog API (no auth required — mounted before authenticated routes)
app.use('/api/v1/changelog', changelogRoutes);

// Public shared account report (no auth required — mounted before authenticated routes)
app.use('/api/v1/account-reports', accountReportsPublicRouter);

// API routes — Core CRM
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/organizations', organizationRoutes);
app.use('/api/v1/contacts', contactRoutes);
app.use('/api/v1/companies', companyRoutes);
app.use('/api/v1/deals', dealRoutes);
app.use('/api/v1/activities', activityRoutes);
app.use('/api/v1/api-keys', apiKeyRoutes);

// API routes — Signal Engine
app.use('/api/v1/signals', signalRoutes);
app.use('/api/v1/sources', signalSourceRoutes);

// Inbound connector webhooks (no auth — verified via HMAC signature)
// Must be mounted BEFORE the authenticated /webhooks routes so the
// more specific /webhooks paths take precedence.
app.use('/api/v1/webhooks/github', githubWebhookRoutes);
app.use('/api/v1/webhooks/segment', segmentWebhookRoutes);
app.use('/api/v1/webhooks/slack', slackInteractionsRoutes);
app.use('/api/v1/webhooks/subscribe', webhookSubscriptionRoutes);

app.use('/api/v1/webhooks', webhookRoutes);

// API routes — Custom Objects
app.use('/api/v1/objects', customObjectRoutes);

// API routes — CSV Import
app.use('/api/v1/import', csvImportRoutes);

// API routes — Settings (Slack, etc.)
app.use('/api/v1/settings', slackSettingsRoutes);

// API routes — Search
app.use('/api/v1/search', searchRoutes);

// API routes — Usage & Billing
app.use('/api/v1/usage', usageRoutes);
app.use('/api/v1/billing', billingRoutes);
app.use('/api/v1/api-usage', apiUsageRoutes);

// API routes — Analytics & Workflows
app.use('/api/v1/analytics', analyticsRoutes);
app.use('/api/v1/analytics/advanced', advancedAnalyticsRoutes);
app.use('/api/v1/workflows', workflowRoutes);

// API routes — Connectors
app.use('/api/v1/connectors', connectorRoutes);
app.use('/api/v1/connectors/discord', discordConnectorRoutes);
app.use('/api/v1/connectors/stackoverflow', stackoverflowConnectorRoutes);
app.use('/api/v1/connectors/twitter', twitterConnectorRoutes);
app.use('/api/v1/connectors/reddit', redditConnectorRoutes);
app.use('/api/v1/connectors/posthog', posthogConnectorRoutes);
app.use('/api/v1/connectors/linkedin', linkedinConnectorRoutes);
app.use('/api/v1/connectors/intercom', intercomConnectorRoutes);
app.use('/api/v1/connectors/zendesk', zendeskConnectorRoutes);

// API routes — Bulk Operations & CSV Export
app.use('/api/v1/bulk', bulkRoutes);

// API routes — Notifications
app.use('/api/v1/notifications', notificationRoutes);

// API routes — Team Members
app.use('/api/v1/members', memberRoutes);

// API routes — Team Invitations
app.use('/api/v1/invitations', invitationRoutes);

// API routes — Audit Log
app.use('/api/v1/audit', auditRoutes);

// API routes — Saved Views
app.use('/api/v1/views', savedViewRoutes);

// API routes — Worker Status
app.use('/api/v1/workers', workerRoutes);

// API routes — Demo Data
app.use('/api/v1/demo', demoRoutes);

// API routes — Email Sequences
app.use('/api/v1/sequences', emailSequenceRoutes);

// API routes — Custom Dashboards
app.use('/api/v1/dashboards', dashboardApiRoutes);

// API routes — CRM Import (HubSpot/Salesforce)
app.use('/api/v1/import/crm', crmImportRoutes);

// API routes — GitHub Onboarding
app.use('/api/v1/onboarding', githubOnboardingRoutes);

// API routes — Integrations (HubSpot + Salesforce bidirectional sync)
app.use('/api/v1/integrations', hubspotSyncRoutes);
app.use('/api/v1/integrations', salesforceSyncRoutes);

// API routes — Playbooks
app.use('/api/v1/playbooks', playbookRoutes);

// API routes — Scoring Rules (no-code lead scoring builder)
app.use('/api/v1/scoring', scoringRoutes);

// API routes — Score Snapshots (PQA score history for trend visualization)
app.use('/api/v1/score-snapshots', scoreSnapshotRoutes);

// API routes — Identity Resolution
app.use('/api/v1/identity', identityRoutes);

// API routes — Clearbit Enrichment
app.use('/api/v1/enrichment', enrichmentRoutes);

// API routes — Enrichment Queue (bulk enrichment management UI)
app.use('/api/v1/enrichment-queue', enrichmentQueueRoutes);

// API routes — SSO (SAML / OIDC)
app.use('/api/v1/sso', ssoRoutes);

// API routes — OAuth Social Login (GitHub / Google)
app.use('/api/v1/oauth', oauthRoutes);

// API routes — AI Engine
app.use('/api/v1/ai', aiRoutes);

// API routes — Custom Field Definitions & Values
app.use('/api/v1/custom-fields', customFieldRoutes);

// API routes — Account Alert Rules
app.use('/api/v1/account-alerts', accountAlertRoutes);

// API routes — Account Reports (shareable)
app.use('/api/v1/account-reports', accountReportRoutes);

// API routes — Signal Anomaly Detection
app.use('/api/v1/anomalies', anomalyRoutes);

// API routes — Signal Pattern Clustering & ICP Matching
app.use('/api/v1/patterns', signalPatternRoutes);

// API routes — Data Export (enterprise compliance & data portability)
app.use('/api/v1/exports', dataExportRoutes);

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
  customSiteTitle: 'Sigscore API Docs',
}));
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  customSiteTitle: 'Sigscore API Docs',
}));

// 404 handler for API routes only.
// Non-API routes are handled by the SPA fallback in server.ts (production)
// or by the Vite dev server (development).
// Note: /api/v1/graphql is mounted later via setupGraphQL() in server.ts,
// so we must skip it here to avoid shadowing the GraphQL endpoint.
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/v1/graphql')) {
    return next();
  }
  res.status(404).json({ error: 'Not Found' });
});
app.use('/graphql', (_req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

// Sentry error handler (must be before app errorHandler)
app.use(sentryErrorHandler());

// Error handling middleware (must be last)
app.use(errorHandler);

export default app;
