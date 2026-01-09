/**
 * Conversation summarization using Claude with batch processing support
 */

import { ClaudeService } from './claude-service.js';
import { BatchProcessor } from './batch-processor.js';
import { Conversation } from './types.js';

export interface ConversationSummary {
  title: string;
  summary: string;
  keyPoints: string[];
  topics: string[];
  outcome: string;
  actionItems?: string[];
  codeSnippets?: number;
  technologiesMentioned: string[];
}

export class ConversationSummarizer {
  private claude: ClaudeService;
  private batchProcessor?: BatchProcessor;
  private systemPrompt = `You are an expert at summarizing technical conversations concisely and accurately.

Your task is to create structured summaries that capture the essence of a conversation.

Guidelines:
- Identify the main goal/question of the conversation
- Extract key insights and decisions
- List important topics covered
- Note the outcome or conclusion
- Identify action items if any
- Mention technologies/frameworks discussed

Output JSON format:
{
  "title": "Concise descriptive title",
  "summary": "2-3 sentence overview",
  "keyPoints": ["Point 1", "Point 2", "Point 3"],
  "topics": ["topic1", "topic2"],
  "outcome": "What was accomplished or concluded",
  "actionItems": ["Optional: things to do"],
  "codeSnippets": 0,
  "technologiesMentioned": ["tech1", "tech2"]
}

Be factual and concise. Avoid speculation.`;

  constructor(claude?: ClaudeService, batchProcessor?: BatchProcessor) {
    this.claude = claude || new ClaudeService();
    this.batchProcessor = batchProcessor || new BatchProcessor('.batch-checkpoints', {
      concurrency: 2,
      delayMs: 400,
      retries: 2,
      checkpointInterval: 10,
      progressBar: true,
    });
  }

  /**
   * Summarize a single conversation
   */
  async summarize(conversation: Conversation): Promise<ConversationSummary> {
    console.log(`📝 Summarizing: ${conversation.title}`);

    // Prepare conversation text
    const conversationText = conversation.messages
      .map((msg) => `${msg.role}: ${msg.content}`)
      .join('\n\n');

    const prompt = `Summarize this conversation:

${conversationText}

Provide a structured summary with title, overview, key points, topics, outcome, and technologies mentioned.`;

    try {
      const response = await this.claude.chat(prompt, {
        systemPrompt: this.systemPrompt,
        maxTokens: 1500,
        temperature: 0.2,
        useCache: true,
      });

      const summary = this.parseSummaryResponse(response);
      console.log(`  ✅ Summary: ${summary.title}`);

      return summary;
    } catch (error) {
      console.error(`  ❌ Failed to summarize:`, error);
      return this.getDefaultSummary(conversation);
    }
  }

  /**
   * Summarize multiple conversations with progress tracking
   */
  async summarizeBatch(conversations: Conversation[]): Promise<Map<string, ConversationSummary>> {
    const results = new Map<string, ConversationSummary>();

    console.log(`\n📋 Summarizing ${conversations.length} conversations...\n`);

    // Check for checkpoint and resume if needed
    let startIndex = 0;
    if (this.batchProcessor?.hasCheckpoint()) {
      console.log('📂 Found checkpoint, resuming from previous progress...\n');
      const { results: checkpointResults } = this.batchProcessor.loadCheckpoint<Conversation>();
      checkpointResults.forEach((result) => {
        if (result.success) {
          results.set(result.item.id, result.result);
        }
      });
      startIndex = checkpointResults.size;
    }

    // Process remaining conversations with batch processor
    const conversationsToProcess = conversations.slice(startIndex);

    if (conversationsToProcess.length > 0) {
      const batchResults = await this.batchProcessor!.process(
        conversationsToProcess,
        async (conv) => {
          return await this.summarize(conv);
        }
      );

      // Merge batch results
      batchResults.forEach((result) => {
        if (result.success) {
          results.set(result.item.id, result.result);
        }
      });
    }

    this.claude.printStats();

    return results;
  }

  /**
   * Create a meta-summary of multiple conversations
   */
  async summarizeCollection(summaries: ConversationSummary[]): Promise<string> {
    console.log(`\n📊 Creating collection summary of ${summaries.length} conversations...`);

    const summaryText = summaries.map((s) => `- ${s.title}: ${s.summary}`).join('\n');

    const prompt = `Create a high-level overview of this collection of conversations:

${summaryText}

Identify common themes, main topics, and key patterns across these conversations.`;

    try {
      const response = await this.claude.chat(prompt, {
        systemPrompt: 'You are an expert at identifying patterns across multiple conversations.',
        maxTokens: 800,
        temperature: 0.3,
      });

      console.log('  ✅ Collection summary created');
      return response;
    } catch (error) {
      console.error('  ❌ Failed to create collection summary:', error);
      return 'Failed to generate collection summary.';
    }
  }

  /**
   * Generate executive summary (non-technical overview)
   */
  async generateExecutiveSummary(summaries: ConversationSummary[]): Promise<string> {
    console.log(`\n👔 Generating executive summary for ${summaries.length} conversations...`);

    const summaryText = summaries.map((s) => `- ${s.title}: ${s.summary}`).join('\n');

    const prompt = `Create an executive-level summary for non-technical stakeholders:

${summaryText}

Focus on:
- Business impact and outcomes
- Key decisions made
- Risks identified and mitigated
- Recommended next steps
- Resource requirements

Keep it concise (2-3 paragraphs) and avoid technical jargon.`;

    try {
      const response = await this.claude.chat(prompt, {
        systemPrompt: 'You are an expert at creating executive summaries for business stakeholders.',
        maxTokens: 600,
        temperature: 0.2,
      });

      console.log('  ✅ Executive summary created');
      return response;
    } catch (error) {
      console.error('  ❌ Failed to create executive summary:', error);
      return 'Failed to generate executive summary.';
    }
  }

  /**
   * Parse Claude's summary response
   */
  private parseSummaryResponse(response: string): ConversationSummary {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return {
          title: 'Untitled',
          summary: response.slice(0, 200),
          keyPoints: [],
          topics: [],
          outcome: 'Unknown',
          technologiesMentioned: [],
        };
      }

      return JSON.parse(jsonMatch[0]);
    } catch (error) {
      return {
        title: 'Untitled',
        summary: response.slice(0, 200),
        keyPoints: [],
        topics: [],
        outcome: 'Unknown',
        technologiesMentioned: [],
      };
    }
  }

  /**
   * Get default summary when Claude fails
   */
  private getDefaultSummary(conversation: Conversation): ConversationSummary {
    return {
      title: conversation.title,
      summary: 'Conversation summary unavailable',
      keyPoints: [],
      topics: [],
      outcome: 'Unknown',
      technologiesMentioned: [],
    };
  }

  /**
   * Get token usage statistics
   */
  getStats() {
    return this.claude.getTokenStats();
  }
}
