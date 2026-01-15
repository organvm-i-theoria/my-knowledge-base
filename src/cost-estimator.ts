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
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  totalCost?: number;
  cacheCreationTokens?: number;
  inputTokensCached?: number;
  tokens?: number;
  itemCount?: number;
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
      throw new Error(`Unsupported model: ${modelName}`);
    }
  }

  /**
   * Estimate cost for embeddings
   */
  estimateEmbeddingCost(texts: string[] | string): CostEstimate {
    const list = Array.isArray(texts) ? texts : [texts];
    const totalTokens = list.reduce((sum, text) => sum + estimateTokens(text), 0);
    const inputCost = (totalTokens * this.priceModel.inputTokens) / 1_000_000;
    const totalCost = inputCost;

    return {
      model: this.modelName,
      estimatedTokens: totalTokens,
      estimatedCost: totalCost,
      totalCost,
      tokens: totalTokens,
      breakdown: {
        inputCost,
        outputCost: 0
      },
      assumptions: [
        `${list.length} texts to embed`,
        `~${totalTokens} total tokens`,
        'Using text-embedding-3-small pricing'
      ],
      itemCount: list.length
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

    const baseInputCost = (inputTokens * this.priceModel.inputTokens) / 1_000_000;
    let inputCost = baseInputCost;
    let outputCost: number;
    let cacheSavings = 0;
    let cacheCreationTokens: number | undefined;
    let inputTokensCached: number | undefined;
    const assumptions: string[] = [];

    if (useCache) {
      cacheCreationTokens = inputTokens;
      inputTokensCached = inputTokens;
      const cacheReadCost = (inputTokens * (this.priceModel.cacheReadTokens || this.priceModel.inputTokens)) / 1_000_000;
      inputCost = cacheReadCost;
      assumptions.push('Assuming cache write cost (first request)');
    }

    outputCost = (outputTokens * this.priceModel.outputTokens) / 1_000_000;

    // Estimate caching savings (90% is typical with proper caching)
    if (useCache && this.priceModel.cacheReadTokens) {
      cacheSavings = baseInputCost - inputCost;
      assumptions.push('Potential cache savings: ~90% on repeated prompts');
    }

    const totalCost = inputCost + outputCost - cacheSavings;

    return {
      model: this.modelName,
      estimatedTokens: inputTokens + outputTokens,
      estimatedCost: totalCost,
      totalCost,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      cacheCreationTokens,
      inputTokensCached,
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

  estimateBatchEmbeddingCost(texts: string[]): CostEstimate {
    const estimate = this.estimateEmbeddingCost(texts);
    return {
      ...estimate,
      itemCount: texts.length
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

  formatCost(cost: number): string {
    return `$${cost.toFixed(4)}`;
  }

  private estimateTokens(text: string): number {
    return estimateTokens(text);
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
  private throwOnExceed = false;
  private callHistory: Array<{ model: string; cost: number; timestamp: Date; id?: string }> = [];
  private modelTotals: Map<string, number> = new Map();
  private totalCalls = 0;

  constructor(config: { budgetLimit?: number; warningThreshold?: number; throwOnExceed?: boolean } = {}) {
    this.budgetLimit = config.budgetLimit;
    if (typeof config.warningThreshold === 'number') {
      this.warningThreshold = config.warningThreshold;
    }
    if (config.throwOnExceed) {
      this.throwOnExceed = true;
    }
  }

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
    return this.callHistory.reduce((sum, call) => sum + call.cost, 0);
  }

  trackAPICall(model: string, cost: number, callId?: string): void {
    this.callHistory.push({ model, cost, timestamp: new Date(), id: callId });
    this.modelTotals.set(model, (this.modelTotals.get(model) || 0) + cost);
    this.totalCalls += 1;
  }

  canProceedWithCost(cost: number): boolean {
    if (!this.budgetLimit || this.budgetLimit === Infinity) {
      return true;
    }
    return this.getTotalCost() + cost <= this.budgetLimit;
  }

  getCallHistory(): Array<{ model: string; cost: number; timestamp: Date; id?: string }> {
    return [...this.callHistory];
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

  getStats(): Record<string, any> {
    const totalCost = this.getTotalCost();
    const totalCalls = this.totalCalls;
    const stats: Record<string, any> = {
      totalCost,
      totalCalls,
      budgetLimit: this.budgetLimit,
      remainingBudget: typeof this.budgetLimit === 'number' ? this.budgetLimit - totalCost : undefined,
      budgetUsagePercent: typeof this.budgetLimit === 'number' ? (totalCost / this.budgetLimit) * 100 : 0,
      budgetWarning: false
    };

    for (const [model, cost] of this.modelTotals.entries()) {
      stats[model] = cost;
    }

    if (typeof this.budgetLimit === 'number' && this.budgetLimit > 0 && this.budgetLimit !== Infinity) {
      const percentUsed = totalCost / this.budgetLimit;
      if (percentUsed >= this.warningThreshold) {
        stats.budgetWarning = true;
      }
      if (this.throwOnExceed && percentUsed > 1) {
        throw new Error('Budget exceeded');
      }
    }

    return stats;
  }

  getReport(): string {
    const stats = this.getStats();
    const lines = [`Total cost: $${stats.totalCost.toFixed(4)}`];
    for (const [model, cost] of this.modelTotals.entries()) {
      lines.push(`${model}: $${cost.toFixed(4)}`);
    }
    if (typeof stats.budgetLimit === 'number') {
      lines.push(`Budget: $${stats.budgetLimit.toFixed(2)}`);
      lines.push(`Used: ${stats.budgetUsagePercent.toFixed(2)}%`);
    }
    return lines.join('\n');
  }

  reset(): void {
    this.callHistory = [];
    this.modelTotals.clear();
    this.totalCalls = 0;
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
