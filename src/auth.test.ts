import { describe, it, expect, beforeEach } from 'vitest';
import {
  AuthService,
  JWTManager,
  APIKeyManager,
  PermissionChecker,
  UserRole,
} from './auth.js';

describe('JWT Manager', () => {
  let jwtManager: JWTManager;

  beforeEach(() => {
    jwtManager = new JWTManager('test-secret', 3600);
  });

  it('should create valid JWT token', () => {
    const token = jwtManager.createToken('user123', [UserRole.ADMIN]);
    expect(token.accessToken).toMatch(/^[^.]+\.[^.]+\.[^.]+$/);
    expect(token.tokenType).toBe('Bearer');
    expect(token.expiresIn).toBe(3600);
  });

  it('should verify valid token', () => {
    const token = jwtManager.createToken('user123', [UserRole.EDITOR]).accessToken;
    const payload = jwtManager.verifyToken(token);
    
    expect(payload).not.toBeNull();
    expect(payload?.userId).toBe('user123');
    expect(payload?.roles).toContain(UserRole.EDITOR);
  });

  it('should reject invalid token', () => {
    const payload = jwtManager.verifyToken('invalid.token.here');
    expect(payload).toBeNull();
  });

  it('should reject tampered token', () => {
    const token = jwtManager.createToken('user123', [UserRole.ADMIN]).accessToken;
    const parts = token.split('.');
    const tampered = parts[0] + '.' + parts[1] + '.invalid';
    
    const payload = jwtManager.verifyToken(tampered);
    expect(payload).toBeNull();
  });
});

describe('API Key Manager', () => {
  let keyManager: APIKeyManager;

  beforeEach(() => {
    keyManager = new APIKeyManager();
  });

  it('should generate valid API key', () => {
    const key = keyManager.generateKey();
    expect(keyManager.isValidFormat(key)).toBe(true);
    expect(key.startsWith('sk_')).toBe(true);
  });

  it('should hash API key', () => {
    const key = 'sk_test123';
    const hash = keyManager.hashKey(key);
    expect(hash.length).toBeGreaterThan(0);
    expect(hash).not.toContain('sk_');
  });

  it('should verify API key', () => {
    const key = keyManager.generateKey();
    const hash = keyManager.hashKey(key);
    
    expect(keyManager.verifyKey(key, hash)).toBe(true);
  });

  it('should reject invalid key format', () => {
    expect(keyManager.isValidFormat('invalid')).toBe(false);
    expect(keyManager.isValidFormat('sk_')).toBe(false);
  });
});

describe('Permission Checker', () => {
  it('should check user roles', () => {
    const hasAdmin = PermissionChecker.hasRole(
      [UserRole.ADMIN],
      [UserRole.ADMIN]
    );
    expect(hasAdmin).toBe(true);
  });

  it('should check multiple roles', () => {
    const hasAny = PermissionChecker.hasRole(
      [UserRole.EDITOR],
      [UserRole.ADMIN, UserRole.EDITOR]
    );
    expect(hasAny).toBe(true);
  });

  it('should return false for missing role', () => {
    const hasViewer = PermissionChecker.hasRole(
      [UserRole.EDITOR],
      [UserRole.VIEWER]
    );
    expect(hasViewer).toBe(false);
  });

  it('should check permissions', () => {
    const canWrite = PermissionChecker.canPerform(
      [UserRole.EDITOR],
      'units:write'
    );
    expect(canWrite).toBe(true);
  });

  it('should deny write for viewers', () => {
    const canWrite = PermissionChecker.canPerform(
      [UserRole.VIEWER],
      'units:write'
    );
    expect(canWrite).toBe(false);
  });

  it('should allow read for all', () => {
    const roles = [UserRole.ADMIN, UserRole.EDITOR, UserRole.VIEWER];
    roles.forEach(role => {
      expect(PermissionChecker.canPerform([role], 'units:read')).toBe(true);
    });
  });

  it('should list user permissions', () => {
    const perms = PermissionChecker.getPermissions([UserRole.EDITOR]);
    expect(perms).toContain('units:read');
    expect(perms).toContain('units:write');
    expect(perms).not.toContain('units:delete');
  });

  it('should show admin permissions', () => {
    const perms = PermissionChecker.getPermissions([UserRole.ADMIN]);
    expect(perms).toContain('units:read');
    expect(perms).toContain('units:write');
    expect(perms).toContain('units:delete');
    expect(perms).toContain('stats:read');
  });
});

describe('Auth Service', () => {
  let authService: AuthService;

  beforeEach(() => {
    authService = new AuthService('test-secret');
  });

  it('should create user', () => {
    const user = authService.createUser('test@example.com', [UserRole.VIEWER]);
    expect(user.id).toBeDefined();
    expect(user.email).toBe('test@example.com');
    expect(user.roles).toContain(UserRole.VIEWER);
  });

  it('should generate API key', () => {
    const user = authService.createUser('test@example.com', [UserRole.EDITOR]);
    const key = authService.generateAPIKey(user.id);
    
    expect(key.startsWith('sk_')).toBe(true);
  });

  it('should authenticate with JWT', () => {
    const user = authService.createUser('test@example.com', [UserRole.EDITOR]);
    const token = authService.createToken(user.id);
    
    const context = authService.authenticateJWT(token.accessToken);
    expect(context.isAuthenticated).toBe(true);
    expect(context.user?.id).toBe(user.id);
  });

  it('should reject invalid JWT', () => {
    const context = authService.authenticateJWT('invalid');
    expect(context.isAuthenticated).toBe(false);
  });

  it('should authenticate with API key', () => {
    const user = authService.createUser('test@example.com', [UserRole.EDITOR]);
    const key = authService.generateAPIKey(user.id);
    
    const context = authService.authenticateAPIKey(key);
    expect(context.isAuthenticated).toBe(true);
    expect(context.user?.id).toBe(user.id);
  });

  it('should reject invalid API key', () => {
    const context = authService.authenticateAPIKey('invalid-key');
    expect(context.isAuthenticated).toBe(false);
  });

  it('should get user', () => {
    const created = authService.createUser('test@example.com');
    const retrieved = authService.getUser(created.id);
    
    expect(retrieved?.id).toBe(created.id);
    expect(retrieved?.email).toBe(created.email);
  });

  it('should update user roles', () => {
    const user = authService.createUser('test@example.com', [UserRole.VIEWER]);
    const updated = authService.updateUserRoles(user.id, [UserRole.EDITOR]);
    
    expect(updated.roles).toContain(UserRole.EDITOR);
    expect(updated.roles).not.toContain(UserRole.VIEWER);
  });

  it('should list users', () => {
    authService.createUser('user1@example.com');
    authService.createUser('user2@example.com');
    
    const users = authService.listUsers();
    expect(users.length).toBeGreaterThan(2);
  });

  it('should provide user permissions in context', () => {
    const user = authService.createUser('test@example.com', [UserRole.EDITOR]);
    const token = authService.createToken(user.id);
    const context = authService.authenticateJWT(token.accessToken);
    
    expect(context.permissions).toContain('units:read');
    expect(context.permissions).toContain('units:write');
  });

  it('should track last active', () => {
    const user = authService.createUser('test@example.com');
    const before = user.lastActive;
    
    authService.authenticateAPIKey(authService.generateAPIKey(user.id));
    const retrieved = authService.getUser(user.id);
    
    expect(retrieved?.lastActive.getTime()).toBeGreaterThan(before.getTime());
  });
});

describe('Auth Edge Cases', () => {
  let authService: AuthService;

  beforeEach(() => {
    authService = new AuthService('test-secret');
  });

  it('should handle non-existent user', () => {
    expect(() => authService.getUser('nonexistent')).not.toThrow();
  });

  it('should throw on API key for non-existent user', () => {
    expect(() => authService.generateAPIKey('nonexistent')).toThrow();
  });

  it('should throw on token creation for non-existent user', () => {
    expect(() => authService.createToken('nonexistent')).toThrow();
  });

  it('should support multiple API keys per user', () => {
    const user = authService.createUser('test@example.com');
    const key1 = authService.generateAPIKey(user.id);
    const key2 = authService.generateAPIKey(user.id);
    
    expect(key1).not.toBe(key2);
  });
});
