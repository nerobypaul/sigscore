import { WebSocketServer, WebSocket } from 'ws';
import { Server } from 'http';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { logger } from '../utils/logger';
import { prisma } from '../config/database';

interface AuthenticatedSocket extends WebSocket {
  userId: string;
  organizationId: string;
  isAlive: boolean;
}

// Track connections by organizationId
const orgConnections = new Map<string, Set<AuthenticatedSocket>>();

let wss: WebSocketServer;

export function initWebSocket(server: Server): void {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', async (ws: WebSocket, req) => {
    // Extract token from query string: ws://host/ws?token=xxx&orgId=xxx
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const token = url.searchParams.get('token');
    const orgId = url.searchParams.get('orgId');

    if (!token || !orgId) {
      ws.close(4001, 'Missing authentication');
      return;
    }

    try {
      const decoded = jwt.verify(token, config.jwt.secret) as { userId: string };

      // Verify user actually belongs to the requested organization
      const membership = await prisma.userOrganization.findUnique({
        where: {
          userId_organizationId: {
            userId: decoded.userId,
            organizationId: orgId,
          },
        },
      });
      if (!membership) {
        ws.close(4002, 'Not a member of this organization');
        return;
      }

      const socket = ws as AuthenticatedSocket;
      socket.userId = decoded.userId;
      socket.organizationId = orgId;
      socket.isAlive = true;

      // Add to org connections
      if (!orgConnections.has(orgId)) {
        orgConnections.set(orgId, new Set());
      }
      orgConnections.get(orgId)!.add(socket);

      logger.info('WebSocket connected', { userId: decoded.userId, orgId });

      socket.on('pong', () => {
        socket.isAlive = true;
      });

      socket.on('close', () => {
        orgConnections.get(orgId)?.delete(socket);
        if (orgConnections.get(orgId)?.size === 0) {
          orgConnections.delete(orgId);
        }
        logger.info('WebSocket disconnected', { userId: socket.userId, orgId });
      });

      // Send a welcome message
      socket.send(JSON.stringify({ type: 'connected', userId: decoded.userId }));
    } catch {
      ws.close(4001, 'Invalid token');
    }
  });

  // Heartbeat to detect dead connections every 30s
  const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
      const socket = ws as AuthenticatedSocket;
      if (!socket.isAlive) {
        socket.terminate();
        return;
      }
      socket.isAlive = false;
      socket.ping();
    });
  }, 30_000);

  wss.on('close', () => clearInterval(interval));

  logger.info('WebSocket server initialized on /ws');
}

// Broadcast to all connections in an organization
export function broadcast(
  organizationId: string,
  event: { type: string; data: unknown }
): void {
  const connections = orgConnections.get(organizationId);
  if (!connections || connections.size === 0) return;

  const message = JSON.stringify(event);
  connections.forEach((socket) => {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(message);
    }
  });
}

// Specific event broadcasters
export function broadcastDealUpdate(organizationId: string, deal: unknown): void {
  broadcast(organizationId, { type: 'deal.updated', data: deal });
}

export function broadcastDealCreated(organizationId: string, deal: unknown): void {
  broadcast(organizationId, { type: 'deal.created', data: deal });
}

export function broadcastSignalCreated(organizationId: string, signal: unknown): void {
  broadcast(organizationId, { type: 'signal.created', data: signal });
}

export function broadcastContactCreated(organizationId: string, contact: unknown): void {
  broadcast(organizationId, { type: 'contact.created', data: contact });
}

export function getConnectionCount(organizationId?: string): number {
  if (organizationId) {
    return orgConnections.get(organizationId)?.size || 0;
  }
  let total = 0;
  orgConnections.forEach((conns) => {
    total += conns.size;
  });
  return total;
}

export function shutdownWebSocket(): void {
  if (wss) {
    wss.close();
  }
}
