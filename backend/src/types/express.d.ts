import { User as PrismaUser } from '@prisma/client';

declare global {
  namespace Express {
    interface User extends PrismaUser {}
    interface Request {
      organizationId?: string;
      /** True when the request was authenticated via an API key (not JWT). */
      apiKeyAuth?: boolean;
      /** Scopes granted to the API key that authenticated this request. */
      apiKeyScopes?: string[];
    }
  }
}
