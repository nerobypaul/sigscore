import app from './app';
import { config } from './config';
import { prisma } from './config/database';
import { setupGraphQL } from './graphql';
import { initWebSocket, shutdownWebSocket } from './services/websocket';
import { logger } from './utils/logger';

const PORT = config.port;

(async () => {
  // Start Apollo GraphQL server and mount endpoint
  await setupGraphQL(app);

  // Start HTTP server
  const server = app.listen(PORT, () => {
    logger.info(`DevSignal CRM running on port ${PORT}`);
    logger.info(`Environment: ${config.nodeEnv}`);
    logger.info(`API Documentation: http://localhost:${PORT}/api-docs`);
    logger.info(`OpenAPI JSON: http://localhost:${PORT}/api-docs.json`);
  });

  // Initialize WebSocket server on the same HTTP server
  initWebSocket(server);

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Shutting down gracefully...`);
    shutdownWebSocket();
    server.close(async () => {
      await prisma.$disconnect();
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
})();

export default app;
