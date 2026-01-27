/**
 * Redaction Service for detecting and masking secrets and PII
 *
 * This service provides pattern-based detection and redaction of:
 * - API keys (OpenAI, Anthropic, AWS, GitHub, etc.)
 * - Secrets (private keys, JWTs, tokens)
 * - PII (SSN, phone numbers, emails, credit cards)
 *
 * It includes sophisticated false-positive filtering to avoid flagging
 * code patterns like `process.env.API_KEY` or type definitions.
 */

import { logger } from './logger.js';

// ============================================================================
// Types
// ============================================================================

export type SecretType =
  | 'api_key_openai'
  | 'api_key_anthropic'
  | 'api_key_aws_access'
  | 'api_key_aws_secret'
  | 'api_key_github'
  | 'api_key_github_fine_grained'
  | 'api_key_stripe'
  | 'api_key_sendgrid'
  | 'api_key_twilio'
  | 'api_key_slack'
  | 'api_key_discord'
  | 'api_key_generic'
  | 'jwt_token'
  | 'private_key'
  | 'bearer_token'
  | 'basic_auth'
  | 'connection_string';

export type PIIType =
  | 'ssn'
  | 'phone_number'
  | 'email_address'
  | 'credit_card'
  | 'ip_address_v4'
  | 'ip_address_v6';

export type DetectedItemType = SecretType | PIIType;

export interface DetectedItem {
  type: DetectedItemType;
  value: string;
  masked: string;
  startIndex: number;
  endIndex: number;
  confidence: number;
  isFalsePositive: boolean;
  falsePositiveReason?: string;
}

export interface RedactionResult {
  originalText: string;
  redactedText: string;
  detectedItems: DetectedItem[];
  stats: {
    totalDetected: number;
    secretsDetected: number;
    piiDetected: number;
    falsePositives: number;
    itemsRedacted: number;
  };
}

export interface RedactionConfig {
  /** Enable secret detection (default: true) */
  detectSecrets?: boolean;
  /** Enable PII detection (default: true) */
  detectPII?: boolean;
  /** Minimum confidence threshold for redaction (0-1, default: 0.5) */
  confidenceThreshold?: number;
  /** Mask format: 'full' = [REDACTED:TYPE], 'partial' = sk-...xyz (default: 'full') */
  maskFormat?: 'full' | 'partial';
  /** Log detections for audit (default: false) */
  auditLog?: boolean;
  /** Skip false positive filtering (for testing) */
  skipFalsePositiveFiltering?: boolean;
}

// ============================================================================
// Pattern Definitions
// ============================================================================

interface PatternDefinition {
  type: DetectedItemType;
  pattern: RegExp;
  confidence: number;
  category: 'secret' | 'pii';
  description: string;
}

const SECRET_PATTERNS: PatternDefinition[] = [
  // OpenAI API Keys
  {
    type: 'api_key_openai',
    pattern: /sk-[a-zA-Z0-9]{20,}/g,
    confidence: 0.95,
    category: 'secret',
    description: 'OpenAI API key',
  },
  {
    type: 'api_key_openai',
    pattern: /sk-proj-[a-zA-Z0-9_-]{80,}/g,
    confidence: 0.98,
    category: 'secret',
    description: 'OpenAI project API key',
  },

  // Anthropic API Keys
  {
    type: 'api_key_anthropic',
    pattern: /sk-ant-api[a-zA-Z0-9_-]{90,}/g,
    confidence: 0.98,
    category: 'secret',
    description: 'Anthropic API key',
  },
  {
    type: 'api_key_anthropic',
    pattern: /sk-ant-[a-zA-Z0-9_-]{40,}/g,
    confidence: 0.95,
    category: 'secret',
    description: 'Anthropic API key (short form)',
  },

  // AWS Keys
  {
    type: 'api_key_aws_access',
    pattern: /AKIA[0-9A-Z]{16}/g,
    confidence: 0.95,
    category: 'secret',
    description: 'AWS Access Key ID',
  },
  {
    type: 'api_key_aws_secret',
    pattern: /(?<![A-Za-z0-9/+=])[A-Za-z0-9/+=]{40}(?![A-Za-z0-9/+=])/g,
    confidence: 0.4, // Lower confidence, needs context
    category: 'secret',
    description: 'AWS Secret Access Key (potential)',
  },

  // GitHub Tokens
  {
    type: 'api_key_github',
    pattern: /ghp_[a-zA-Z0-9]{36}/g,
    confidence: 0.98,
    category: 'secret',
    description: 'GitHub Personal Access Token',
  },
  {
    type: 'api_key_github',
    pattern: /gho_[a-zA-Z0-9]{36}/g,
    confidence: 0.98,
    category: 'secret',
    description: 'GitHub OAuth Token',
  },
  {
    type: 'api_key_github',
    pattern: /ghu_[a-zA-Z0-9]{36}/g,
    confidence: 0.98,
    category: 'secret',
    description: 'GitHub User-to-Server Token',
  },
  {
    type: 'api_key_github',
    pattern: /ghs_[a-zA-Z0-9]{36}/g,
    confidence: 0.98,
    category: 'secret',
    description: 'GitHub Server-to-Server Token',
  },
  {
    type: 'api_key_github_fine_grained',
    pattern: /github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59}/g,
    confidence: 0.98,
    category: 'secret',
    description: 'GitHub Fine-Grained PAT',
  },

  // Stripe Keys
  {
    type: 'api_key_stripe',
    pattern: /sk_live_[a-zA-Z0-9]{24,}/g,
    confidence: 0.98,
    category: 'secret',
    description: 'Stripe Live Secret Key',
  },
  {
    type: 'api_key_stripe',
    pattern: /sk_test_[a-zA-Z0-9]{24,}/g,
    confidence: 0.95,
    category: 'secret',
    description: 'Stripe Test Secret Key',
  },
  {
    type: 'api_key_stripe',
    pattern: /rk_live_[a-zA-Z0-9]{24,}/g,
    confidence: 0.98,
    category: 'secret',
    description: 'Stripe Restricted Key',
  },

  // SendGrid
  {
    type: 'api_key_sendgrid',
    pattern: /SG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}/g,
    confidence: 0.98,
    category: 'secret',
    description: 'SendGrid API Key',
  },

  // Twilio
  {
    type: 'api_key_twilio',
    pattern: /SK[a-f0-9]{32}/g,
    confidence: 0.9,
    category: 'secret',
    description: 'Twilio API Key',
  },

  // Slack
  {
    type: 'api_key_slack',
    pattern: /xoxb-[0-9]{10,13}-[0-9]{10,13}-[a-zA-Z0-9]{24}/g,
    confidence: 0.98,
    category: 'secret',
    description: 'Slack Bot Token',
  },
  {
    type: 'api_key_slack',
    pattern: /xoxp-[0-9]{10,13}-[0-9]{10,13}-[0-9]{10,13}-[a-f0-9]{32}/g,
    confidence: 0.98,
    category: 'secret',
    description: 'Slack User Token',
  },
  {
    type: 'api_key_slack',
    pattern: /xapp-[0-9]-[A-Z0-9]+-[0-9]+-[a-z0-9]+/g,
    confidence: 0.98,
    category: 'secret',
    description: 'Slack App Token',
  },

  // Discord
  {
    type: 'api_key_discord',
    pattern: /[MN][A-Za-z\d]{23,}\.[\w-]{6}\.[\w-]{27}/g,
    confidence: 0.9,
    category: 'secret',
    description: 'Discord Bot Token',
  },

  // JWT Tokens
  {
    type: 'jwt_token',
    pattern: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g,
    confidence: 0.95,
    category: 'secret',
    description: 'JWT Token',
  },

  // Private Keys (PEM format)
  {
    type: 'private_key',
    pattern: /-----BEGIN (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g,
    confidence: 0.99,
    category: 'secret',
    description: 'PEM Private Key',
  },

  // Bearer tokens in headers
  {
    type: 'bearer_token',
    pattern: /Bearer\s+[a-zA-Z0-9_-]{20,}/gi,
    confidence: 0.8,
    category: 'secret',
    description: 'Bearer Token',
  },

  // Basic auth in URLs
  {
    type: 'basic_auth',
    pattern: /https?:\/\/[^:\/\s]+:[^@\/\s]+@[^\s]+/g,
    confidence: 0.85,
    category: 'secret',
    description: 'Basic Auth in URL',
  },

  // Connection strings
  {
    type: 'connection_string',
    pattern: /(?:mongodb|postgres|mysql|redis|amqp):\/\/[^\s'"]+/g,
    confidence: 0.7,
    category: 'secret',
    description: 'Database Connection String',
  },

  // Generic API key patterns (lower confidence)
  {
    type: 'api_key_generic',
    pattern: /(?:api[_-]?key|apikey|api[_-]?secret|secret[_-]?key)[\s]*[=:]\s*["']([a-zA-Z0-9_-]{20,})["']/gi,
    confidence: 0.6,
    category: 'secret',
    description: 'Generic API Key Assignment',
  },
];

const PII_PATTERNS: PatternDefinition[] = [
  // Social Security Number (US)
  {
    type: 'ssn',
    pattern: /\b\d{3}-\d{2}-\d{4}\b/g,
    confidence: 0.9,
    category: 'pii',
    description: 'Social Security Number',
  },
  {
    type: 'ssn',
    pattern: /\b\d{9}\b/g,
    confidence: 0.5, // Lower confidence for bare 9-digit numbers
    category: 'pii',
    description: 'Potential SSN (no dashes)',
  },

  // Phone Numbers (various formats)
  {
    type: 'phone_number',
    pattern: /\b\+?1?[-.\s]?\(?[0-9]{3}\)?[-.\s]?[0-9]{3}[-.\s]?[0-9]{4}\b/g,
    confidence: 0.8,
    category: 'pii',
    description: 'US Phone Number',
  },
  {
    type: 'phone_number',
    pattern: /\b\+[1-9]\d{1,14}\b/g,
    confidence: 0.85,
    category: 'pii',
    description: 'International Phone Number (E.164)',
  },

  // Email addresses
  {
    type: 'email_address',
    pattern: /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g,
    confidence: 0.9,
    category: 'pii',
    description: 'Email Address',
  },

  // Credit Card Numbers (major brands)
  {
    type: 'credit_card',
    pattern: /\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b/g,
    confidence: 0.85,
    category: 'pii',
    description: 'Credit Card Number',
  },
  {
    type: 'credit_card',
    pattern: /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g,
    confidence: 0.7,
    category: 'pii',
    description: 'Credit Card Number (formatted)',
  },

  // IPv4 Address
  {
    type: 'ip_address_v4',
    pattern: /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g,
    confidence: 0.7,
    category: 'pii',
    description: 'IPv4 Address',
  },

  // IPv6 Address (simplified pattern)
  {
    type: 'ip_address_v6',
    pattern: /\b(?:[0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}\b/g,
    confidence: 0.85,
    category: 'pii',
    description: 'IPv6 Address',
  },
];

// ============================================================================
// False Positive Filters
// ============================================================================

interface FalsePositiveContext {
  /** Pattern matches environment variable access */
  isEnvAccess: boolean;
  /** Pattern matches code declaration/type definition */
  isCodeDeclaration: boolean;
  /** Pattern matches placeholder/example value */
  isPlaceholder: boolean;
  /** Pattern matches documentation comment */
  isDocumentation: boolean;
  /** Pattern matches allow-secret annotation */
  hasAllowAnnotation: boolean;
  /** Pattern matches partial/masked format */
  isAlreadyMasked: boolean;
  /** Surrounding context (100 chars before and after) */
  surroundingContext: string;
}

const FALSE_POSITIVE_PATTERNS = {
  // Environment variable access patterns
  envAccess: [
    /process\.env\.[A-Z_]+/i,
    /os\.environ\[['"][A-Z_]+['"]\]/i,
    /\$\{?[A-Z_]+\}?/,
    /env\(['"]\w+['"]\)/i,
    /getenv\(['"]\w+['"]\)/i,
  ],

  // Code declarations and type definitions
  codeDeclaration: [
    /const\s+\w+\s*=\s*process\.env/i,
    /let\s+\w+\s*=\s*process\.env/i,
    /var\s+\w+\s*=\s*process\.env/i,
    /:\s*string\s*[;,)]/i,
    /interface\s+\w+/i,
    /type\s+\w+\s*=/i,
    /\w+\s*:\s*(?:string|number|boolean|any)\b/i,
    /export\s+(?:const|let|var|type|interface)/i,
  ],

  // Placeholder and example values
  placeholder: [
    /['"]your[_-]?api[_-]?key['"]/i,
    /['"]your[_-]?secret[_-]?key['"]/i,
    /['"]xxx+['"]/i,
    /['"]test[_-]?key['"]/i,
    /['"]example[_-]?\w*['"]/i,
    /['"]placeholder['"]/i,
    /['"]<[^>]+>['"]/i, // <YOUR_API_KEY>
    /sk-\.\.\.$/i, // sk-...
    /\.\.\.[a-z0-9]+$/i, // ...xyz partial mask
    /\[REDACTED[:\]]/i,
    /\*{4,}/,
  ],

  // Documentation patterns
  documentation: [
    /\/\/\s*(?:example|todo|fixme|note):/i,
    /\/\*\*?[\s\S]*?\*\//,
    /#\s*(?:example|todo|fixme|note):/i,
    /<!--[\s\S]*?-->/,
    /```[\s\S]*?```/,
  ],

  // Allow annotations
  allowAnnotation: [
    /\/\/\s*allow-secret/i,
    /\/\/\s*nosec/i,
    /\/\/\s*noqa/i,
    /#\s*allow-secret/i,
    /<!--\s*allow-secret\s*-->/i,
  ],

  // Already masked patterns
  alreadyMasked: [
    /sk-\.\.\.[a-z0-9]+/i,
    /\*{4,}/,
    /\[REDACTED[:\w]*\]/i,
    /x{4,}/i,
    /\.\.\.[a-z0-9]{3,6}$/i,
  ],
};

// Known safe example values that appear in code
const SAFE_EXAMPLE_VALUES = new Set([
  'sk-test',
  'sk-xxx',
  'sk-example',
  'sk-your-api-key',
  'sk-placeholder',
  'test-key',
  'example-key',
  'your-api-key',
  'your-secret-key',
  'YOUR_API_KEY',
  'YOUR_SECRET_KEY',
  'API_KEY_HERE',
  'INSERT_KEY_HERE',
]);

// ============================================================================
// Redaction Service Implementation
// ============================================================================

export class RedactionService {
  private config: Required<RedactionConfig>;

  constructor(config: RedactionConfig = {}) {
    this.config = {
      detectSecrets: config.detectSecrets ?? true,
      detectPII: config.detectPII ?? true,
      confidenceThreshold: config.confidenceThreshold ?? 0.5,
      maskFormat: config.maskFormat ?? 'full',
      auditLog: config.auditLog ?? false,
      skipFalsePositiveFiltering: config.skipFalsePositiveFiltering ?? false,
    };
  }

  /**
   * Detect secrets and PII in text without redacting
   */
  detect(text: string): DetectedItem[] {
    const items: DetectedItem[] = [];

    if (this.config.detectSecrets) {
      items.push(...this.detectPatterns(text, SECRET_PATTERNS));
    }

    if (this.config.detectPII) {
      items.push(...this.detectPatterns(text, PII_PATTERNS));
    }

    // Sort by position and deduplicate overlapping matches
    return this.deduplicateOverlapping(items);
  }

  /**
   * Detect and redact secrets and PII from text
   */
  redact(text: string): RedactionResult {
    const detectedItems = this.detect(text);

    // Filter items that should be redacted
    const itemsToRedact = detectedItems.filter(
      (item) =>
        !item.isFalsePositive && item.confidence >= this.config.confidenceThreshold
    );

    // Apply redactions from end to start to preserve indices
    let redactedText = text;
    const sortedItems = [...itemsToRedact].sort((a, b) => b.startIndex - a.startIndex);

    for (const item of sortedItems) {
      const before = redactedText.slice(0, item.startIndex);
      const after = redactedText.slice(item.endIndex);
      redactedText = before + item.masked + after;
    }

    // Calculate stats
    const secretsDetected = detectedItems.filter(
      (i) => this.isSecretType(i.type)
    ).length;
    const piiDetected = detectedItems.filter((i) => this.isPIIType(i.type)).length;
    const falsePositives = detectedItems.filter((i) => i.isFalsePositive).length;

    const result: RedactionResult = {
      originalText: text,
      redactedText,
      detectedItems,
      stats: {
        totalDetected: detectedItems.length,
        secretsDetected,
        piiDetected,
        falsePositives,
        itemsRedacted: itemsToRedact.length,
      },
    };

    if (this.config.auditLog && itemsToRedact.length > 0) {
      logger.info(
        `Redacted ${itemsToRedact.length} items`,
        {
          types: itemsToRedact.map((i) => i.type),
        },
        'RedactionService'
      );
    }

    return result;
  }

  /**
   * Check if text contains any detectable secrets or PII
   */
  hasSecrets(text: string): boolean {
    const items = this.detect(text);
    return items.some(
      (item) =>
        !item.isFalsePositive &&
        item.confidence >= this.config.confidenceThreshold &&
        this.isSecretType(item.type)
    );
  }

  /**
   * Check if text contains any detectable PII
   */
  hasPII(text: string): boolean {
    const items = this.detect(text);
    return items.some(
      (item) =>
        !item.isFalsePositive &&
        item.confidence >= this.config.confidenceThreshold &&
        this.isPIIType(item.type)
    );
  }

  /**
   * Validate text and return warnings (for pipeline integration)
   */
  validate(text: string): { isClean: boolean; warnings: string[] } {
    const items = this.detect(text);
    const realItems = items.filter(
      (i) => !i.isFalsePositive && i.confidence >= this.config.confidenceThreshold
    );

    const warnings = realItems.map(
      (item) =>
        `Detected ${item.type} at position ${item.startIndex} (confidence: ${(item.confidence * 100).toFixed(0)}%)`
    );

    return {
      isClean: realItems.length === 0,
      warnings,
    };
  }

  // ========================================================================
  // Private Methods
  // ========================================================================

  private detectPatterns(text: string, patterns: PatternDefinition[]): DetectedItem[] {
    const items: DetectedItem[] = [];

    for (const patternDef of patterns) {
      // Reset regex state
      patternDef.pattern.lastIndex = 0;

      let match;
      while ((match = patternDef.pattern.exec(text)) !== null) {
        const value = match[0];
        const startIndex = match.index;
        const endIndex = startIndex + value.length;

        // Check for false positives
        const fpContext = this.getFalsePositiveContext(text, startIndex, endIndex, value);
        const isFalsePositive = this.config.skipFalsePositiveFiltering
          ? false
          : this.isFalsePositive(value, fpContext);

        items.push({
          type: patternDef.type,
          value,
          masked: this.createMask(value, patternDef.type),
          startIndex,
          endIndex,
          confidence: patternDef.confidence,
          isFalsePositive,
          falsePositiveReason: isFalsePositive
            ? this.getFalsePositiveReason(value, fpContext)
            : undefined,
        });
      }
    }

    return items;
  }

  private getFalsePositiveContext(
    text: string,
    startIndex: number,
    endIndex: number,
    value: string
  ): FalsePositiveContext {
    // Get surrounding context (100 chars before and after)
    const contextStart = Math.max(0, startIndex - 100);
    const contextEnd = Math.min(text.length, endIndex + 100);
    const surroundingContext = text.slice(contextStart, contextEnd);

    // Check line context
    const lineStart = text.lastIndexOf('\n', startIndex) + 1;
    const lineEnd = text.indexOf('\n', endIndex);
    const line = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd);

    return {
      isEnvAccess: FALSE_POSITIVE_PATTERNS.envAccess.some((p) => p.test(line)),
      isCodeDeclaration: FALSE_POSITIVE_PATTERNS.codeDeclaration.some((p) =>
        p.test(line)
      ),
      isPlaceholder: FALSE_POSITIVE_PATTERNS.placeholder.some((p) => p.test(value)),
      isDocumentation: FALSE_POSITIVE_PATTERNS.documentation.some((p) =>
        p.test(surroundingContext)
      ),
      hasAllowAnnotation: FALSE_POSITIVE_PATTERNS.allowAnnotation.some((p) =>
        p.test(line)
      ),
      isAlreadyMasked: FALSE_POSITIVE_PATTERNS.alreadyMasked.some((p) => p.test(value)),
      surroundingContext,
    };
  }

  private isFalsePositive(value: string, context: FalsePositiveContext): boolean {
    // Check known safe values
    if (SAFE_EXAMPLE_VALUES.has(value) || SAFE_EXAMPLE_VALUES.has(value.toLowerCase())) {
      return true;
    }

    // Check context flags
    if (context.hasAllowAnnotation) return true;
    if (context.isAlreadyMasked) return true;
    if (context.isPlaceholder) return true;

    // Environment variable access in code
    if (context.isEnvAccess && context.isCodeDeclaration) return true;

    // Type definitions (e.g., "apiKey: string")
    if (context.isCodeDeclaration && !this.looksLikeRealSecret(value)) return true;

    return false;
  }

  private getFalsePositiveReason(
    value: string,
    context: FalsePositiveContext
  ): string {
    if (SAFE_EXAMPLE_VALUES.has(value) || SAFE_EXAMPLE_VALUES.has(value.toLowerCase())) {
      return 'Known safe example value';
    }
    if (context.hasAllowAnnotation) return 'Has allow-secret annotation';
    if (context.isAlreadyMasked) return 'Already masked';
    if (context.isPlaceholder) return 'Placeholder value';
    if (context.isEnvAccess && context.isCodeDeclaration)
      return 'Environment variable access in code';
    if (context.isCodeDeclaration) return 'Code declaration/type definition';
    return 'Unknown';
  }

  private looksLikeRealSecret(value: string): boolean {
    // Real secrets typically have high entropy and specific formats
    const hasHighEntropy = this.calculateEntropy(value) > 3.5;
    const hasSecretPrefix =
      value.startsWith('sk-') ||
      value.startsWith('ghp_') ||
      value.startsWith('gho_') ||
      value.startsWith('AKIA') ||
      value.startsWith('eyJ');

    return hasHighEntropy && hasSecretPrefix;
  }

  private calculateEntropy(str: string): number {
    const len = str.length;
    const frequencies = new Map<string, number>();

    for (const char of str) {
      frequencies.set(char, (frequencies.get(char) || 0) + 1);
    }

    let entropy = 0;
    for (const count of frequencies.values()) {
      const p = count / len;
      entropy -= p * Math.log2(p);
    }

    return entropy;
  }

  private createMask(value: string, type: DetectedItemType): string {
    if (this.config.maskFormat === 'partial') {
      // Show first few and last few characters
      if (value.length > 10) {
        const prefix = value.slice(0, 4);
        const suffix = value.slice(-3);
        return `${prefix}...${suffix}`;
      }
      return '*'.repeat(value.length);
    }

    // Full redaction format
    const typeLabel = type.toUpperCase().replace(/_/g, ' ');
    return `[REDACTED:${typeLabel}]`;
  }

  private deduplicateOverlapping(items: DetectedItem[]): DetectedItem[] {
    if (items.length <= 1) return items;

    // Sort by start index
    const sorted = [...items].sort((a, b) => a.startIndex - b.startIndex);
    const result: DetectedItem[] = [];

    for (const item of sorted) {
      const lastItem = result[result.length - 1];

      // Check for overlap with previous item
      if (lastItem && item.startIndex < lastItem.endIndex) {
        // Keep the one with higher confidence, or longer match if equal
        if (
          item.confidence > lastItem.confidence ||
          (item.confidence === lastItem.confidence &&
            item.value.length > lastItem.value.length)
        ) {
          result[result.length - 1] = item;
        }
        // Otherwise keep the previous one (do nothing)
      } else {
        result.push(item);
      }
    }

    return result;
  }

  private isSecretType(type: DetectedItemType): type is SecretType {
    return SECRET_PATTERNS.some((p) => p.type === type);
  }

  private isPIIType(type: DetectedItemType): type is PIIType {
    return PII_PATTERNS.some((p) => p.type === type);
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let defaultInstance: RedactionService | null = null;

export function getRedactionService(config?: RedactionConfig): RedactionService {
  if (!defaultInstance || config) {
    defaultInstance = new RedactionService(config);
  }
  return defaultInstance;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Quick check if text needs redaction (for performance)
 */
export function needsRedaction(text: string): boolean {
  // Quick heuristic checks before full scan
  const quickPatterns = [
    /sk-[a-zA-Z0-9]{20,}/,
    /sk-ant-/,
    /ghp_[a-zA-Z0-9]{36}/,
    /AKIA[0-9A-Z]{16}/,
    /eyJ[a-zA-Z0-9_-]+\./,
    /-----BEGIN.*PRIVATE KEY-----/,
    /\d{3}-\d{2}-\d{4}/, // SSN
  ];

  return quickPatterns.some((p) => p.test(text));
}

/**
 * Redact text using default service
 */
export function redactText(text: string, config?: RedactionConfig): RedactionResult {
  const service = config ? new RedactionService(config) : getRedactionService();
  return service.redact(text);
}
