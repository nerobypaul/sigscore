import dotenv from 'dotenv';

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';

function requireEnv(name: string, fallback: string): string {
  const value = process.env[name];
  if (value) return value;
  if (isProduction) {
    throw new Error(`CRITICAL: ${name} must be set in production. Do not run with fallback secrets.`);
  }
  return fallback;
}

export const config = {
  nodeEnv: process.env.NODE_ENV || 'development',
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  apiUrl: process.env.API_URL || 'http://localhost:3000',
  corsOrigin: requireEnv('CORS_ORIGIN', 'http://localhost:5173'),

  database: {
    url: process.env.DATABASE_URL || '',
  },

  jwt: {
    secret: requireEnv('JWT_SECRET', 'UNSAFE-DEV-SECRET-DO-NOT-USE-IN-PROD'),
    refreshSecret: requireEnv('JWT_REFRESH_SECRET', 'UNSAFE-DEV-REFRESH-SECRET-DO-NOT-USE-IN-PROD'),
    expiresIn: process.env.JWT_EXPIRES_IN || '15m',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  oauth: {
    google: {
      clientId: process.env.OAUTH_GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.OAUTH_GOOGLE_CLIENT_SECRET || '',
      callbackUrl: process.env.OAUTH_GOOGLE_CALLBACK_URL || '',
    },
    github: {
      clientId: process.env.OAUTH_GITHUB_CLIENT_ID || '',
      clientSecret: process.env.OAUTH_GITHUB_CLIENT_SECRET || '',
      callbackUrl: process.env.OAUTH_GITHUB_CALLBACK_URL || '',
    },
  },

  frontend: {
    url: process.env.FRONTEND_URL || 'http://localhost:5173',
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY || '',
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929',
  },

  stripe: {
    secretKey: requireEnv('STRIPE_SECRET_KEY', 'sk_test_placeholder'),
    webhookSecret: requireEnv('STRIPE_WEBHOOK_SECRET', 'whsec_test_placeholder'),
    pricePro: process.env.STRIPE_PRICE_PRO || 'price_pro_placeholder',
    priceGrowth: process.env.STRIPE_PRICE_GROWTH || 'price_growth_placeholder',
    priceScale: process.env.STRIPE_PRICE_SCALE || 'price_scale_placeholder',
  },

  email: {
    resendApiKey: process.env.RESEND_API_KEY || '',
    fromAddress: process.env.EMAIL_FROM || 'DevSignal <notifications@devsignal.dev>',
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },

  sentry: {
    dsn: process.env.SENTRY_DSN || '',
  },
};
