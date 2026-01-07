/**
 * Authentication and Authorization System
 * Supports JWT, API keys, and role-based access control
 */

import { Logger } from './logger.js';
import crypto from 'crypto';

const logger = new Logger({ context: 'auth' });

export enum UserRole {
  ADMIN = 'admin',
  EDITOR = 'editor',
  VIEWER = 'viewer',
  API_CLIENT = 'api_client',
}

export interface AuthUser {
  id: string;
  email?: string;
  roles: UserRole[];
  apiKey?: string;
  createdAt: Date;
  lastActive: Date;
}

export interface TokenPayload {
  userId: string;
  roles: UserRole[];
  iat: number;
  exp: number;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken?: string;
  expiresIn: number;
  tokenType: 'Bearer';
}

/**
 * JWT Manager
 */
export class JWTManager {
  private secret: string;
  private expiresIn: number;

  constructor(secret?: string, expiresIn: number = 3600) {
    this.secret = secret || process.env.JWT_SECRET || 'dev-secret-key';
    this.expiresIn = expiresIn;
  }

  createToken(userId: string, roles: UserRole[]): TokenResponse {
    const now = Math.floor(Date.now() / 1000);
    const payload: TokenPayload = {
      userId,
      roles,
      iat: now,
      exp: now + this.expiresIn,
    };

    const header = this.encode({ alg: 'HS256', typ: 'JWT' });
    const body = this.encode(payload);
    const signature = this.sign(header + '.' + body);

    return {
      accessToken: header + '.' + body + '.' + signature,
      expiresIn: this.expiresIn,
      tokenType: 'Bearer',
    };
  }

  verifyToken(token: string): TokenPayload | null {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;

      const header = parts[0];
      const body = parts[1];
      const signature = parts[2];
      const expectedSignature = this.sign(header + '.' + body);

      if (signature !== expectedSignature) {
        logger.warn('Invalid token signature');
        return null;
      }

      const payload = this.decode(body) as TokenPayload;

      if (payload.exp < Math.floor(Date.now() / 1000)) {
        logger.warn('Token expired');
        return null;
      }

      return payload;
    } catch (error) {
      logger.error('Token verification failed: ' + error);
      return null;
    }
  }

  private encode(obj: any): string {
    return Buffer.from(JSON.stringify(obj)).toString('base64url');
  }

  private decode(str: string): any {
    return JSON.parse(Buffer.from(str, 'base64url').toString());
  }

  private sign(data: string): string {
    return crypto
      .createHmac('sha256', this.secret)
      .update(data)
      .digest('base64url');
  }
}

/**
 * API Key Manager
 */
export class APIKeyManager {
  private prefix: string = 'sk_';

  generateKey(): string {
    const randomBytes = crypto.randomBytes(32).toString('hex');
    return this.prefix + randomBytes;
  }

  hashKey(key: string): string {
    return crypto.createHash('sha256').update(key).digest('hex');
  }

  verifyKey(key: string, hash: string): boolean {
    return this.hashKey(key) === hash;
  }

  isValidFormat(key: string): boolean {
    return key.startsWith(this.prefix) && key.length > this.prefix.length;
  }
}

/**
 * Permission Checker
 */
export class PermissionChecker {
  static hasRole(userRoles: UserRole[], requiredRoles: UserRole[]): boolean {
    return requiredRoles.some(required => userRoles.includes(required));
  }

  static canPerform(userRoles: UserRole[], action: string): boolean {
    const permissions: Record<string, UserRole[]> = {
      'units:read': [UserRole.ADMIN, UserRole.EDITOR, UserRole.VIEWER, UserRole.API_CLIENT],
      'units:write': [UserRole.ADMIN, UserRole.EDITOR],
      'units:delete': [UserRole.ADMIN],
      'tags:read': [UserRole.ADMIN, UserRole.EDITOR, UserRole.VIEWER, UserRole.API_CLIENT],
      'tags:write': [UserRole.ADMIN, UserRole.EDITOR],
      'search:read': [UserRole.ADMIN, UserRole.EDITOR, UserRole.VIEWER, UserRole.API_CLIENT],
      'stats:read': [UserRole.ADMIN],
      'auth:manage': [UserRole.ADMIN],
    };

    const required = permissions[action];
    if (!required) return false;

    return this.hasRole(userRoles, required);
  }

  static getPermissions(userRoles: UserRole[]): string[] {
    const allPermissions: Record<string, UserRole[]> = {
      'units:read': [UserRole.ADMIN, UserRole.EDITOR, UserRole.VIEWER, UserRole.API_CLIENT],
      'units:write': [UserRole.ADMIN, UserRole.EDITOR],
      'units:delete': [UserRole.ADMIN],
      'tags:read': [UserRole.ADMIN, UserRole.EDITOR, UserRole.VIEWER, UserRole.API_CLIENT],
      'tags:write': [UserRole.ADMIN, UserRole.EDITOR],
      'search:read': [UserRole.ADMIN, UserRole.EDITOR, UserRole.VIEWER, UserRole.API_CLIENT],
      'stats:read': [UserRole.ADMIN],
      'auth:manage': [UserRole.ADMIN],
    };

    return Object.entries(allPermissions)
      .filter(([_, roles]) => this.hasRole(userRoles, roles))
      .map(([perm]) => perm);
  }
}

export interface AuthContext {
  user: AuthUser | null;
  token?: string;
  isAuthenticated: boolean;
  permissions: string[];
}

/**
 * Auth Service
 */
export class AuthService {
  private jwtManager: JWTManager;
  private apiKeyManager: APIKeyManager;
  private users: Map<string, AuthUser> = new Map();
  private apiKeyHashes: Map<string, string> = new Map();

  constructor(jwtSecret?: string) {
    this.jwtManager = new JWTManager(jwtSecret);
    this.apiKeyManager = new APIKeyManager();
    this.createUser('admin@example.com', [UserRole.ADMIN]);
  }

  createUser(email: string, roles: UserRole[] = [UserRole.VIEWER]): AuthUser {
    const user: AuthUser = {
      id: 'user_' + Date.now(),
      email,
      roles,
      createdAt: new Date(),
      lastActive: new Date(),
    };

    this.users.set(user.id, user);
    logger.info('Created user: ' + email);
    return user;
  }

  generateAPIKey(userId: string): string {
    const user = this.users.get(userId);
    if (!user) throw new Error('User not found: ' + userId);

    const key = this.apiKeyManager.generateKey();
    const hash = this.apiKeyManager.hashKey(key);

    this.apiKeyHashes.set(hash, userId);
    user.apiKey = hash;

    logger.info('Generated API key for user: ' + userId);
    return key;
  }

  authenticateJWT(token: string): AuthContext {
    const payload = this.jwtManager.verifyToken(token);

    if (!payload) {
      return {
        user: null,
        isAuthenticated: false,
        permissions: [],
      };
    }

    const user = this.users.get(payload.userId);

    if (!user) {
      return {
        user: null,
        isAuthenticated: false,
        permissions: [],
      };
    }

    user.lastActive = new Date();

    return {
      user,
      token,
      isAuthenticated: true,
      permissions: PermissionChecker.getPermissions(user.roles),
    };
  }

  authenticateAPIKey(key: string): AuthContext {
    if (!this.apiKeyManager.isValidFormat(key)) {
      return {
        user: null,
        isAuthenticated: false,
        permissions: [],
      };
    }

    const hash = this.apiKeyManager.hashKey(key);
    const userId = this.apiKeyHashes.get(hash);

    if (!userId) {
      logger.warn('Invalid API key attempt');
      return {
        user: null,
        isAuthenticated: false,
        permissions: [],
      };
    }

    const user = this.users.get(userId);

    if (!user) {
      return {
        user: null,
        isAuthenticated: false,
        permissions: [],
      };
    }

    user.lastActive = new Date();

    return {
      user,
      isAuthenticated: true,
      permissions: PermissionChecker.getPermissions(user.roles),
    };
  }

  createToken(userId: string): TokenResponse {
    const user = this.users.get(userId);
    if (!user) throw new Error('User not found: ' + userId);

    return this.jwtManager.createToken(userId, user.roles);
  }

  getUser(userId: string): AuthUser | undefined {
    return this.users.get(userId);
  }

  updateUserRoles(userId: string, roles: UserRole[]): AuthUser {
    const user = this.users.get(userId);
    if (!user) throw new Error('User not found: ' + userId);

    user.roles = roles;
    logger.info('Updated roles for user: ' + userId);
    return user;
  }

  listUsers(): AuthUser[] {
    return Array.from(this.users.values());
  }
}

export function createAuthMiddleware(authService: AuthService) {
  return (req: any, res: any, next: any) => {
    const auth =
      req.headers.authorization ||
      (req.query.api_key && 'ApiKey ' + req.query.api_key);

    if (!auth) {
      req.authContext = {
        user: null,
        isAuthenticated: false,
        permissions: [],
      };
      return next();
    }

    let context: AuthContext | null = null;

    if (auth.startsWith('Bearer ')) {
      const token = auth.substring(7);
      context = authService.authenticateJWT(token);
    } else if (auth.startsWith('ApiKey ')) {
      const key = auth.substring(7);
      context = authService.authenticateAPIKey(key);
    }

    req.authContext = context || {
      user: null,
      isAuthenticated: false,
      permissions: [],
    };

    next();
  };
}

export function requireAuth(req: any, res: any, next: any) {
  if (!req.authContext || !req.authContext.isAuthenticated) {
    return res.status(401).json({
      error: 'Unauthorized',
      code: 'AUTH_REQUIRED',
      statusCode: 401,
    });
  }
  next();
}

export function requirePermission(permission: string) {
  return (req: any, res: any, next: any) => {
    if (!req.authContext || !req.authContext.permissions.includes(permission)) {
      return res.status(403).json({
        error: 'Forbidden',
        code: 'PERMISSION_DENIED',
        statusCode: 403,
        required: permission,
      });
    }
    next();
  };
}

export function requireRole(...roles: UserRole[]) {
  return (req: any, res: any, next: any) => {
    if (!req.authContext || !PermissionChecker.hasRole(req.authContext.user?.roles || [], roles)) {
      return res.status(403).json({
        error: 'Forbidden',
        code: 'ROLE_REQUIRED',
        statusCode: 403,
        required: roles,
      });
    }
    next();
  };
}
