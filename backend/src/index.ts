import app from './app';
import { config } from './config';
import { logger } from './utils/logger';

// Start server
const PORT = config.port;
app.listen(PORT, () => {
  logger.info(`DevSignal CRM running on port ${PORT}`);
  logger.info(`Environment: ${config.nodeEnv}`);
  logger.info(`API Documentation: http://localhost:${PORT}/api-docs`);
  logger.info(`OpenAPI JSON: http://localhost:${PORT}/api-docs.json`);
});

export default app;
