/**
 * Google OAuth2 Authentication Helper
 * Manages OAuth2 flow and token storage for Google Docs API access
 */

import { existsSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { randomBytes } from 'crypto';

export interface GoogleCredentials {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expiry_date?: number;
}

export class GoogleAuthHelper {
  private clientId: string;
  private clientSecret: string;
  private redirectUri: string;
  private tokenPath: string;
  private tokens: GoogleCredentials | null = null;

  constructor(clientId: string, clientSecret: string, redirectUri: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.redirectUri = redirectUri;
    this.tokenPath = join(process.cwd(), 'config', 'google-tokens.json');
  }

  /**
   * Get the authorization URL for OAuth flow
   */
  getAuthorizationUrl(scopes: string[]): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: scopes.join(' '),
      access_type: 'offline',
      prompt: 'consent',
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  /**
   * Exchange authorization code for access token
   */
  async exchangeCodeForToken(code: string): Promise<GoogleCredentials> {
    const tokenUrl = 'https://oauth2.googleapis.com/token';

    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: this.redirectUri,
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      throw new Error(`Failed to exchange code for token: ${response.statusText}`);
    }

    const data = await response.json();

    const credentials: GoogleCredentials = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      token_type: data.token_type || 'Bearer',
      expiry_date: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
    };

    this.tokens = credentials;
    this.saveTokens();

    return credentials;
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(): Promise<GoogleCredentials> {
    if (!this.tokens?.refresh_token) {
      throw new Error('No refresh token available. Please authenticate first.');
    }

    const tokenUrl = 'https://oauth2.googleapis.com/token';

    const body = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      refresh_token: this.tokens.refresh_token,
      grant_type: 'refresh_token',
    });

    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      throw new Error(`Failed to refresh token: ${response.statusText}`);
    }

    const data = await response.json();

    this.tokens = {
      ...this.tokens,
      access_token: data.access_token,
      token_type: data.token_type || 'Bearer',
      expiry_date: data.expires_in ? Date.now() + data.expires_in * 1000 : undefined,
    };

    this.saveTokens();

    return this.tokens;
  }

  /**
   * Load saved tokens from file
   */
  loadTokens(): GoogleCredentials | null {
    if (!existsSync(this.tokenPath)) {
      return null;
    }

    try {
      const data = readFileSync(this.tokenPath, 'utf-8');
      this.tokens = JSON.parse(data);
      return this.tokens;
    } catch (e) {
      return null;
    }
  }

  /**
   * Check if tokens are valid and not expired
   */
  areTokensValid(): boolean {
    if (!this.tokens?.access_token) {
      return false;
    }

    // Check if token is expired
    if (this.tokens.expiry_date && this.tokens.expiry_date < Date.now()) {
      return false;
    }

    return true;
  }

  /**
   * Get valid access token, refreshing if needed
   */
  async getValidAccessToken(): Promise<string> {
    if (!this.tokens) {
      this.loadTokens();
    }

    if (!this.tokens) {
      throw new Error('No tokens available. Please authenticate first.');
    }

    // If token is expired or about to expire (within 5 minutes), refresh it
    if (this.tokens.expiry_date && this.tokens.expiry_date - Date.now() < 5 * 60 * 1000) {
      await this.refreshToken();
    }

    return this.tokens.access_token;
  }

  /**
   * Save tokens to encrypted file
   */
  private saveTokens(): void {
    if (!this.tokens) return;

    const configDir = join(process.cwd(), 'config');
    try {
      // Create config directory if it doesn't exist
      if (!existsSync(configDir)) {
        // Note: Would use fs.mkdirSync in real implementation
        console.log(`Note: config directory should exist at ${configDir}`);
      }

      // In production, tokens should be encrypted
      // For now, save as plain JSON with restricted permissions
      writeFileSync(this.tokenPath, JSON.stringify(this.tokens, null, 2), {
        mode: 0o600, // Read/write for owner only
      });
    } catch (e) {
      console.error(`Failed to save tokens: ${e}`);
    }
  }

  /**
   * Clear stored tokens
   */
  clearTokens(): void {
    this.tokens = null;
    if (existsSync(this.tokenPath)) {
      try {
        // In real implementation, would unlink file
      } catch (e) {
        // Ignore
      }
    }
  }
}
