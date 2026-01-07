/**
 * Cost estimation and tracking for API usage
 */

import { logger } from './logger.js';

export interface PriceModel {
  inputTokens: number; // cost per 1M tokens
  outputTokens: number; // cost per 1M tokens
  cacheWriteTokens?: number; // cost per 1M tokens (usually 1.25x input)
  cacheReadTokens?: number; // cost per 1M tokens (usually 0.1x input)
}

export interface CostEstimate {
  model: string;
  estimatedTokens: number;
  estimatedCost: number;
  breakdown: {
    inputCost: number;
    outputCost: number;
    cacheSavings?: number;
  };
  assumptions: string[];
}

export interface CostUsage {
  model: string;
  inputTokens: number;
  outputTokens: number;
  cacheWriteTokens?: number;
  cacheReadTokens?: number;
  totalCost: number;
  timestamp: Date;
}

/**
 * API pricing models (as of 2024)
 */
export const PRICING_MODELS: Record<string, PriceModel> = {
  // OpenAI Embeddings
  'text-embedding-3-small': {
    inputTokens: 20, // $0.02 per 1M tokens
    outputTokens: 20
  },
  'text-embedding-3-large': {
    inputTokens: 130, // $0.13 per 1M tokens
    outputTokens: 130
  },

  // Anthropic Claude
  'claude-3-haiku': {
    inputTokens: 250, // $0.25 per 1M
    outputTokens: 1250, // $1.25 per 1M
    cacheWriteTokens: 312, // $0.3125 per 1M (1.25x)
    cacheReadTokens: 25 // $0.025 per 1M (0.1x)
  },
  'claude-3-sonnet': {
    inputTokens: 3000, // $3 per 1M
    outputTokens: 15000, // $15 per 1M
    cacheWriteTokens: 3750, // $3.75 per 1M
    cacheReadTokens: 300 // $0.30 per 1M
  },
  'claude-3-opus': {
    inputTokens: 15000, // $15 per 1M
    outputTokens: 75000, // $75 per 1M
    cacheWriteTokens: 18750,
    cacheReadTokens: 1500
  },
  'claude-3-5-sonnet-20241022': {
    inputTokens: 3000, // $3 per 1M
    outputTokens: 15000, // $15 per 1M
    cacheWriteTokens: 3750,
    cacheReadTokens: 300
  }
};

/**
 * Estimate tokens for a given text
 * Rule of thumb: ~4 characters = 1 token, ~1.3 words = 1 token
 */
function estimateTokens(text: string): number {
  // More accurate: roughly 0.25 tokens per character
  return Math.ceil(text.length / 4);
}

/**
 * Cost estimator for API operations
 */
export class CostEstimator {
  private priceModel: PriceModel;
  private modelName: string;
  private usageHistory: CostUsage[] = [];

  constructor(modelName: string, customPricing?: PriceModel) {
    this.modelName = modelName;
    this.priceModel = customPricing || PRICING_MODELS[modelName];

    if (!this.priceModel) {
      logger.warn(
        `Unknown model: ${modelName}, using default pricing`,
        { model: modelName },
        'CostEstimator'
      );
      this.priceModel = {
        inputTokens: 1000,
        outputTokens: 2000
      };
    }
  }

  /**
   * Estimate cost for embeddings
   */
  estimateEmbeddingCost(texts: string[]): CostEstimate {
    const totalTokens = texts.reduce((sum, text) => sum + estimateTokens(text), 0);
    const inputCost = (totalTokens * this.priceModel.inputTokens) / 1_000_000;

    return {
      model: this.modelName,
      estimatedTokens: totalTokens,
      estimatedCost: inputCost,
      breakdown: {
        inputCost,
        outputCost: 0
      },
      assumptions: [
        `${texts.length} texts to embed`,
        `~${totalTokens} total tokens`,
        'Using text-embedding-3-small pricing'
      ]
    };
  }

  /**
   * Estimate cost for Claude message
   */
  estimateMessageCost(
    systemPrompt: string,
    userMessage: string,
    expectedOutputTokens: number = 1000,
    useCache: boolean = false
  ): CostEstimate {
    const systemTokens = estimateTokens(systemPrompt);
    const inputTokens = systemTokens + estimateTokens(userMessage);
    const outputTokens = expectedOutputTokens;

    let inputCost: number;
    let outputCost: number;
    let cacheSavings = 0;
    const assumptions: string[] = [];

    if (useCache) {
      // With caching, first request pays full price for input + cache write
      // Subsequent requests pay cache read + new input
      inputCost = (inputTokens * this.priceModel.inputTokens) / 1_000_000;
      inputCost += (inputTokens * (this.priceModel.cacheWriteTokens || 0)) / 1_000_000;
      assumptions.push('Assuming cache write cost (first request)');
    } else {
      inputCost = (inputTokens * this.priceModel.inputTokens) / 1_000_000;
    }

    outputCost = (outputTokens * this.priceModel.outputTokens) / 1_000_000;

    // Estimate caching savings (90% is typical with proper caching)
    if (useCache && this.priceModel.cacheReadTokens) {
      const cachedInputCost = (inputTokens * this.priceModel.cacheReadTokens) / 1_000_000;
      cacheSavings = inputCost - cachedInputCost;
      assumptions.push('Potential cache savings: ~90% on repeated prompts');
    }

    const totalCost = inputCost + outputCost - cacheSavings;

    return {
      model: this.modelName,
      estimatedTokens: inputTokens + outputTokens,
      estimatedCost: totalCost,
      breakdown: {
        inputCost,
        outputCost,
        cacheSavings: useCache ? cacheSavings : undefined
      },
      assumptions: [
        `System prompt: ~${systemTokens} tokens`,
        `User message: ~${estimateTokens(userMessage)} tokens`,
        `Expected output: ~${outputTokens} tokens`,
        ...assumptions
      ]
    };
  }

  /**
   * Estimate batch processing cost
   */
  estimateBatchCost(
    items: string[],
    costPerItem: number,
    itemType: string = 'unit'
  ): CostEstimate {
    const totalCost = items.length * costPerItem;

    return {
      model: this.modelName,
      estimatedTokens: items.length * 1000, // rough estimate
      estimatedCost: totalCost,
      breakdown: {
        inputCost: totalCost,
        outputCost: 0
      },
      assumptions: [
        `${items.length} ${itemType}s to process`,
        `$${costPerItem.toFixed(4)} per item`,
        `Total: $${totalCost.toFixed(4)}`
      ]
    };
  }

  /**
   * Track actual usage
   */
  recordUsage(
    inputTokens: number,
    outputTokens: number = 0,
    cacheWriteTokens: number = 0,
    cacheReadTokens: number = 0
  ): CostUsage {
    const inputCost = (inputTokens * this.priceModel.inputTokens) / 1_000_000;
    const outputCost = (outputTokens * this.priceModel.outputTokens) / 1_000_000;
    const cacheWriteCost = (cacheWriteTokens * (this.priceModel.cacheWriteTokens || 0)) / 1_000_000;
    const cacheReadCost = (cacheReadTokens * (this.priceModel.cacheReadTokens || 0)) / 1_000_000;

    const totalCost = inputCost + outputCost + cacheWriteCost + cacheReadCost;

    const usage: CostUsage = {
      model: this.modelName,
      inputTokens,
      outputTokens,
      cacheWriteTokens: cacheWriteTokens > 0 ? cacheWriteTokens : undefined,
      cacheReadTokens: cacheReadTokens > 0 ? cacheReadTokens : undefined,
      totalCost,
      timestamp: new Date()
    };

    this.usageHistory.push(usage);

    logger.debug(
      `Usage recorded`,
      {
        model: this.modelName,
        tokens: inputTokens + outputTokens,
        cost: totalCost.toFixed(4)
      },
      'CostEstimator'
    );

    return usage;
  }

  /**
   * Get total cost from usage history
   */
  getTotalCost(): number {
    return this.usageHistory.reduce((sum, usage) => sum + usage.totalCost, 0);
  }

  /**
   * Get usage statistics
   */
  getStats() {
    const totalInputTokens = this.usageHistory.reduce((sum, u) => sum + u.inputTokens, 0);
    const totalOutputTokens = this.usageHistory.reduce((sum, u) => sum + u.outputTokens, 0);
    const totalTokens = totalInputTokens + totalOutputTokens;
    const totalCost = this.getTotalCost();
    const requestCount = this.usageHistory.length;
    const avgCostPerRequest = requestCount > 0 ? totalCost / requestCount : 0;

    return {
      model: this.modelName,
      requestCount,
      totalTokens,
      totalInputTokens,
      totalOutputTokens,
      totalCost,
      avgCostPerRequest,
      avgTokensPerRequest: requestCount > 0 ? totalTokens / requestCount : 0
    };
  }

  /**
   * Reset usage history
   */
  reset(): void {
    this.usageHistory = [];
    logger.debug(`Cost estimator reset: ${this.modelName}`, undefined, 'CostEstimator');
  }

  /**
   * Format cost estimate for display
   */
  formatEstimate(estimate: CostEstimate): string {
    const lines = [
      `📊 ${estimate.model}`,
      `Estimated tokens: ${estimate.estimatedTokens.toLocaleString()}`,
      `Estimated cost: $${estimate.estimatedCost.toFixed(4)}`,
      ``,
      `Breakdown:`,
      `  Input: $${estimate.breakdown.inputCost.toFixed(4)}`,
      `  Output: $${estimate.breakdown.outputCost.toFixed(4)}`
    ];

    if (estimate.breakdown.cacheSavings !== undefined) {
      lines.push(`  Cache savings: -$${estimate.breakdown.cacheSavings.toFixed(4)}`);
    }

    lines.push(`\nAssumptions:`);
    estimate.assumptions.forEach(a => lines.push(`  • ${a}`));

    return lines.join('\n');
  }
}

/**
 * Cost tracking for monitoring expenses
 */
export class CostTracker {
  private estimators: Map<string, CostEstimator> = new Map();
  private startTime = new Date();
  private budgetLimit?: number; // in dollars
  private warningThreshold = 0.8; // warn at 80% of budget

  /**
   * Create or get estimator
   */
  getEstimator(modelName: string): CostEstimator {
    if (!this.estimators.has(modelName)) {
      this.estimators.set(modelName, new CostEstimator(modelName));
    }
    return this.estimators.get(modelName)!;
  }

  /**
   * Set budget limit
   */
  setBudget(limit: number): void {
    this.budgetLimit = limit;
    logger.info(`Budget limit set: $${limit}`, undefined, 'CostTracker');
  }

  /**
   * Check if approaching budget limit
   */
  checkBudget(): { withinBudget: boolean; percentUsed: number; warning?: string } {
    if (!this.budgetLimit) {
      return { withinBudget: true, percentUsed: 0 };
    }

    const totalSpent = this.getTotalCost();
    const percentUsed = totalSpent / this.budgetLimit;

    if (percentUsed > 1) {
      return {
        withinBudget: false,
        percentUsed: percentUsed * 100,
        warning: `⚠️  Budget exceeded: $${totalSpent.toFixed(2)} / $${this.budgetLimit}`
      };
    }

    if (percentUsed > this.warningThreshold) {
      return {
        withinBudget: true,
        percentUsed: percentUsed * 100,
        warning: `⚠️  Warning: ${Math.round(percentUsed * 100)}% of budget used ($${totalSpent.toFixed(2)} / $${this.budgetLimit})`
      };
    }

    return { withinBudget: true, percentUsed: percentUsed * 100 };
  }

  /**
   * Get total cost across all models
   */
  getTotalCost(): number {
    return Array.from(this.estimators.values()).reduce(
      (sum, est) => sum + est.getTotalCost(),
      0
    );
  }

  /**
   * Get summary report
   */
  getSummary() {
    const stats: any[] = [];
    let totalCost = 0;

    for (const [model, estimator] of this.estimators) {
      const modelStats = estimator.getStats();
      stats.push(modelStats);
      totalCost += modelStats.totalCost;
    }

    const elapsedHours = (Date.now() - this.startTime.getTime()) / (1000 * 60 * 60);
    const costPerHour = elapsedHours > 0 ? totalCost / elapsedHours : 0;

    return {
      startTime: this.startTime,
      totalCost,
      costPerHour,
      elapsedHours,
      models: stats,
      budgetLimit: this.budgetLimit,
      budgetStatus: this.checkBudget()
    };
  }

  /**
   * Print summary to console
   */
  printSummary(): void {
    const summary = this.getSummary();

    console.log('\n💰 Cost Summary:');
    console.log(`  Total spent: $${summary.totalCost.toFixed(4)}`);
    console.log(`  Elapsed: ${summary.elapsedHours.toFixed(1)} hours`);
    console.log(`  Cost/hour: $${summary.costPerHour.toFixed(4)}`);

    if (summary.budgetLimit) {
      console.log(`  Budget: $${summary.budgetLimit}`);
      console.log(`  Used: ${Math.round(summary.budgetStatus.percentUsed)}%`);
    }

    if (summary.models.length > 0) {
      console.log(`\n  Models:`);
      for (const model of summary.models) {
        console.log(`    ${model.model}: $${model.totalCost.toFixed(4)} (${model.requestCount} requests)`);
      }
    }

    if (summary.budgetStatus.warning) {
      console.log(`\n${summary.budgetStatus.warning}`);
    }
  }
}

/**
 * Global cost tracker instance
 */
let globalTracker: CostTracker | null = null;

export function getCostTracker(): CostTracker {
  if (!globalTracker) {
    globalTracker = new CostTracker();
  }
  return globalTracker;
}
