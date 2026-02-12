import { ApolloServer, HeaderMap } from '@apollo/server';
import type { Application, Request, Response } from 'express';
import { prisma } from '../config/database';
import { verifyAccessToken } from '../utils/jwt';
import { logger } from '../utils/logger';
import typeDefs from './typeDefs';
import resolvers, { type GraphQLContext } from './resolvers';
import { createLoaders } from './dataloader';

// ============================================================
// Apollo Server instance
// ============================================================

const server = new ApolloServer<GraphQLContext>({
  typeDefs,
  resolvers,
});

// ============================================================
// Build GraphQL context from an Express request
// ============================================================

async function buildContext(req: Request): Promise<GraphQLContext> {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw new Error('Missing or invalid authorization header');
  }

  const token = authHeader.substring(7);
  const payload = verifyAccessToken(token);

  const organizationId = req.headers['x-organization-id'] as string | undefined;

  if (!organizationId) {
    throw new Error('Missing x-organization-id header');
  }

  // Verify the user belongs to this organization
  const userOrg = await prisma.userOrganization.findUnique({
    where: {
      userId_organizationId: {
        userId: payload.userId,
        organizationId,
      },
    },
  });

  if (!userOrg) {
    throw new Error('Access to organization denied');
  }

  // Create fresh DataLoaders per request for proper batching isolation
  const loaders = createLoaders(prisma, organizationId);

  return {
    userId: payload.userId,
    organizationId,
    prisma,
    loaders,
  };
}

// ============================================================
// Express handler that bridges to Apollo Server 5
// ============================================================

async function graphqlHandler(req: Request, res: Response): Promise<void> {
  try {
    // Build the context (auth + org resolution)
    let contextValue: GraphQLContext;
    try {
      contextValue = await buildContext(req);
    } catch (authError) {
      const message = authError instanceof Error ? authError.message : 'Authentication failed';
      res.status(401).json({ errors: [{ message }] });
      return;
    }

    // Convert Express headers to Apollo HeaderMap
    const headers = new HeaderMap();
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') {
        headers.set(key, value);
      }
    }

    // Execute the GraphQL request through Apollo Server
    const httpGraphQLResponse = await server.executeHTTPGraphQLRequest({
      httpGraphQLRequest: {
        method: req.method,
        headers,
        search: new URL(req.url, `http://${req.headers.host || 'localhost'}`).search,
        body: req.body,
      },
      context: async () => contextValue,
    });

    // Write response status
    if (httpGraphQLResponse.status) {
      res.status(httpGraphQLResponse.status);
    }

    // Write response headers
    for (const [key, value] of httpGraphQLResponse.headers) {
      res.setHeader(key, value);
    }

    // Write response body
    if (httpGraphQLResponse.body.kind === 'complete') {
      res.send(httpGraphQLResponse.body.string);
    } else {
      // Streaming / chunked response (subscriptions, @defer, etc.)
      for await (const chunk of httpGraphQLResponse.body.asyncIterator) {
        res.write(chunk);
      }
      res.end();
    }
  } catch (error) {
    logger.error('GraphQL request error:', error);
    res.status(500).json({ errors: [{ message: 'Internal server error' }] });
  }
}

// ============================================================
// Setup function — call from app entrypoint
// ============================================================

export async function setupGraphQL(app: Application): Promise<void> {
  // Start the Apollo Server (required before handling requests)
  await server.start();

  logger.info('Apollo GraphQL server started');

  // Mount the handler — express.json() is already applied globally in src/index.ts
  app.all('/api/v1/graphql', graphqlHandler);

  logger.info('GraphQL endpoint mounted at /api/v1/graphql');
}
