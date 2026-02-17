import { User as PrismaUser } from '@prisma/client';

declare global {
  namespace Express {
    interface User extends PrismaUser {}
    interface Request {
      /** Unique identifier for this request, used for tracing and debugging. */
      requestId?: string;
      organizationId?: string;
      /** The authenticated user's role within the current organization. */
      orgRole?: import('@prisma/client').OrgRole;
      /** True when the request was authenticated via an API key (not JWT). */
      apiKeyAuth?: boolean;
      /** Scopes granted to the API key that authenticated this request. */
      apiKeyScopes?: string[];
    }
  }
}
