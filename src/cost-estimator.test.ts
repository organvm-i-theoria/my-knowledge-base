import { describe, it, expect, beforeEach } from 'vitest';
import { CostEstimator, CostTracker, PRICING_MODELS } from './cost-estimator';

describe('CostEstimator', () => {
  let estimator: CostEstimator;

  beforeEach(() => {
    estimator = new CostEstimator('claude-3-5-sonnet-20241022');
  });

  describe('Token Estimation', () => {
    it('should estimate tokens for text', () => {
      const tokens = estimator['estimateTokens']('Hello world');
      expect(tokens).toBeGreaterThan(0);
    });

    it('should estimate more tokens for longer text', () => {
      const short = estimator['estimateTokens']('Hi');
      const long = estimator['estimateTokens']('This is a much longer text with many more words');
      expect(long).toBeGreaterThan(short);
    });

    it('should handle empty text', () => {
      const tokens = estimator['estimateTokens']('');
      expect(tokens).toBe(0);
    });
  });

  describe('Message Cost Estimation', () => {
    it('should estimate cost for simple message', () => {
      const estimate = estimator.estimateMessageCost(
        'You are helpful',
        'What is 2+2?',
        100
      );

      expect(estimate).toHaveProperty('totalCost');
      expect(estimate).toHaveProperty('inputTokens');
      expect(estimate).toHaveProperty('outputTokens');
      expect(estimate.totalCost).toBeGreaterThan(0);
    });

    it('should be cheaper with caching', () => {
      const withoutCache = estimator.estimateMessageCost(
        'System prompt',
        'User message',
        100,
        false
      );

      const withCache = estimator.estimateMessageCost(
        'System prompt',
        'User message',
        100,
        true
      );

      // Cache reads should be cheaper
      expect(withCache.totalCost).toBeLessThan(withoutCache.totalCost);
    });

    it('should include cache write cost on first request', () => {
      const cacheFirstRequest = estimator.estimateMessageCost(
        'System prompt',
        'User message',
        100,
        true
      );

      expect(cacheFirstRequest).toHaveProperty('cacheCreationTokens');
      expect(cacheFirstRequest.cacheCreationTokens).toBeGreaterThan(0);
    });
  });

  describe('Embedding Cost Estimation', () => {
    it('should estimate cost for text embedding', () => {
      const estimate = estimator.estimateEmbeddingCost('Hello world');
      expect(estimate.totalCost).toBeGreaterThan(0);
      expect(estimate.tokens).toBeGreaterThan(0);
    });

    it('should estimate batch embedding cost', () => {
      const texts = ['Text 1', 'Text 2', 'Text 3'];
      const estimate = estimator.estimateBatchEmbeddingCost(texts);

      expect(estimate.totalCost).toBeGreaterThan(0);
      expect(estimate.tokens).toBeGreaterThan(0);
      expect(estimate.itemCount).toBe(3);
    });

    it('should use correct embedding model pricing', () => {
      const sonnetEstimator = new CostEstimator('claude-3-5-sonnet-20241022');
      const embedEstimator = new CostEstimator('text-embedding-3-small');

      const messageCost = sonnetEstimator.estimateMessageCost(
        'System',
        'Message',
        100
      );
      const embedCost = embedEstimator.estimateEmbeddingCost('Text');

      // Message should cost more than embedding
      expect(messageCost.totalCost).toBeGreaterThan(embedCost.totalCost);
    });
  });

  describe('Cost Formatting', () => {
    it('should format cost as currency', () => {
      const estimate = estimator.estimateMessageCost('System', 'Message', 100);
      const formatted = estimator.formatCost(estimate.totalCost);

      expect(formatted).toContain('$');
      expect(formatted).toMatch(/\$\d+\.\d{4}/);
    });

    it('should handle very small costs', () => {
      const smallCost = 0.000001;
      const formatted = estimator.formatCost(smallCost);
      expect(formatted).toContain('$');
    });

    it('should handle zero cost', () => {
      const formatted = estimator.formatCost(0);
      expect(formatted).toBe('$0.0000');
    });
  });

  describe('Different Models', () => {
    it('should support Claude Sonnet', () => {
      const est = new CostEstimator('claude-3-5-sonnet-20241022');
      const cost = est.estimateMessageCost('Sys', 'Msg', 100);
      expect(cost.totalCost).toBeGreaterThan(0);
    });

    it('should support text-embedding model', () => {
      const est = new CostEstimator('text-embedding-3-small');
      const cost = est.estimateEmbeddingCost('Text');
      expect(cost.totalCost).toBeGreaterThan(0);
    });

    it('should throw for unsupported model', () => {
      expect(() => new CostEstimator('unsupported-model')).toThrow();
    });
  });

  describe('Detailed Breakdown', () => {
    it('should provide token breakdown', () => {
      const estimate = estimator.estimateMessageCost(
        'You are helpful',
        'Hello',
        50
      );

      expect(estimate.inputTokens).toBeGreaterThan(0);
      expect(estimate.outputTokens).toBe(50);
      expect(estimate.totalTokens).toBe(estimate.inputTokens + 50);
    });

    it('should show cache impact when enabled', () => {
      const estimate = estimator.estimateMessageCost(
        'Long system prompt here',
        'Message',
        100,
        true
      );

      expect(estimate).toHaveProperty('cacheCreationTokens');
      expect(estimate).toHaveProperty('inputTokensCached');
    });
  });
});

describe('CostTracker', () => {
  let tracker: CostTracker;

  beforeEach(() => {
    tracker = new CostTracker({
      budgetLimit: 10.0,
      warningThreshold: 0.8,
    });
  });

  describe('Cost Tracking', () => {
    it('should initialize with zero cost', () => {
      expect(tracker.getTotalCost()).toBe(0);
    });

    it('should track API calls', () => {
      tracker.trackAPICall('claude', 0.01);
      tracker.trackAPICall('openai', 0.005);

      expect(tracker.getTotalCost()).toBeCloseTo(0.015);
    });

    it('should track by model', () => {
      tracker.trackAPICall('claude', 0.01);
      tracker.trackAPICall('claude', 0.02);
      tracker.trackAPICall('openai', 0.01);

      const stats = tracker.getStats();
      expect(stats['claude']).toBeCloseTo(0.03);
      expect(stats['openai']).toBeCloseTo(0.01);
    });

    it('should count API calls', () => {
      tracker.trackAPICall('claude', 0.01);
      tracker.trackAPICall('claude', 0.01);
      tracker.trackAPICall('openai', 0.01);

      const stats = tracker.getStats();
      expect(stats.totalCalls).toBe(3);
    });
  });

  describe('Budget Management', () => {
    it('should not exceed budget by default', async () => {
      tracker.trackAPICall('claude', 9.0);

      const canProceed = await tracker.canProceedWithCost(0.5);
      expect(canProceed).toBe(true);
    });

    it('should warn when approaching budget', async () => {
      tracker.trackAPICall('claude', 8.0);

      const stats = tracker.getStats();
      expect(stats.budgetWarning).toBe(true);
    });

    it('should prevent exceeding budget', async () => {
      tracker.trackAPICall('claude', 9.5);

      const canProceed = await tracker.canProceedWithCost(1.0);
      expect(canProceed).toBe(false);
    });

    it('should throw when disabled and budget exceeded', () => {
      tracker = new CostTracker({
        budgetLimit: 1.0,
        throwOnExceed: true,
      });

      tracker.trackAPICall('claude', 0.5);
      tracker.trackAPICall('claude', 0.6);

      expect(() => tracker.getStats()).toThrow();
    });

    it('should allow custom budget check', async () => {
      tracker.trackAPICall('claude', 5.0);
      const canAdd = await tracker.canProceedWithCost(3.0);
      expect(canAdd).toBe(true);

      const cannotAdd = await tracker.canProceedWithCost(6.0);
      expect(cannotAdd).toBe(false);
    });
  });

  describe('Statistics and Reporting', () => {
    it('should provide comprehensive stats', () => {
      tracker.trackAPICall('claude', 0.05);
      tracker.trackAPICall('openai', 0.03);

      const stats = tracker.getStats();

      expect(stats.totalCost).toBeCloseTo(0.08);
      expect(stats.totalCalls).toBe(2);
      expect(stats['claude']).toBeCloseTo(0.05);
      expect(stats['openai']).toBeCloseTo(0.03);
      expect(stats.budgetLimit).toBe(10.0);
      expect(stats.remainingBudget).toBeCloseTo(9.92);
      expect(stats.budgetUsagePercent).toBeCloseTo(0.8);
    });

    it('should format human-readable report', () => {
      tracker.trackAPICall('claude', 1.5);
      tracker.trackAPICall('openai', 0.5);

      const report = tracker.getReport();

      expect(report).toContain('claude');
      expect(report).toContain('openai');
      expect(report).toContain('$');
    });

    it('should track call history', () => {
      tracker.trackAPICall('claude', 0.01, 'test-call-1');
      tracker.trackAPICall('openai', 0.02, 'test-call-2');

      const history = tracker.getCallHistory();
      expect(history.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Budget Limits', () => {
    it('should allow unlimited budget', () => {
      const unlimited = new CostTracker({ budgetLimit: Infinity });
      unlimited.trackAPICall('claude', 1000);
      expect(unlimited.getTotalCost()).toBe(1000);
    });

    it('should support different warning thresholds', () => {
      const strictTracker = new CostTracker({
        budgetLimit: 10,
        warningThreshold: 0.5,
      });

      strictTracker.trackAPICall('claude', 5.1);
      const stats = strictTracker.getStats();
      expect(stats.budgetWarning).toBe(true);
    });

    it('should reset tracking', () => {
      tracker.trackAPICall('claude', 5);
      expect(tracker.getTotalCost()).toBeCloseTo(5);

      tracker.reset();
      expect(tracker.getTotalCost()).toBe(0);
    });
  });

  describe('Estimation Integration', () => {
    it('should estimate and track costs', () => {
      const estimator = new CostEstimator('claude-3-5-sonnet-20241022');
      const estimate = estimator.estimateMessageCost('System', 'Message', 100);

      tracker.trackAPICall('claude', estimate.totalCost);

      expect(tracker.getTotalCost()).toBeCloseTo(estimate.totalCost);
    });

    it('should prevent over-budget estimates', async () => {
      const estimator = new CostEstimator('claude-3-5-sonnet-20241022');

      // First call uses budget
      tracker.trackAPICall('claude', 9.5);

      // Check if expensive operation would exceed budget
      const estimate = estimator.estimateMessageCost('Sys', 'Msg', 500);
      const canProceed = await tracker.canProceedWithCost(estimate.totalCost);

      expect(canProceed).toBe(false);
    });
  });

  describe('Multiple Trackers', () => {
    it('should support independent trackers', () => {
      const tracker1 = new CostTracker({ budgetLimit: 5 });
      const tracker2 = new CostTracker({ budgetLimit: 10 });

      tracker1.trackAPICall('claude', 2);
      tracker2.trackAPICall('claude', 5);

      expect(tracker1.getTotalCost()).toBeCloseTo(2);
      expect(tracker2.getTotalCost()).toBeCloseTo(5);
    });
  });
});

describe('Pricing Models', () => {
  it('should have Claude models defined', () => {
    expect(PRICING_MODELS['claude-3-5-sonnet-20241022']).toBeDefined();
  });

  it('should have embedding models defined', () => {
    expect(PRICING_MODELS['text-embedding-3-small']).toBeDefined();
    expect(PRICING_MODELS['text-embedding-3-large']).toBeDefined();
  });

  it('should have cache pricing for Claude models', () => {
    const model = PRICING_MODELS['claude-3-5-sonnet-20241022'];
    expect(model.cacheWriteTokens).toBeDefined();
    expect(model.cacheReadTokens).toBeDefined();
    expect(model.cacheWriteTokens).toBeGreaterThan(model.inputTokens);
    expect(model.cacheReadTokens).toBeLessThan(model.inputTokens);
  });
});
