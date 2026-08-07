/**
 * src/modules/ai/ai.service.ts
 *
 * Central AI service — the ONLY entry point for business logic to make AI calls.
 * Routes to the configured provider, tracks every call, and implements fallback.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OpenAIProvider } from './providers/openai.provider';
import { GeminiProvider } from './providers/gemini.provider';
import { ClaudeProvider } from './providers/claude.provider';
import {
  IAIProvider, AiGenerateOptions, AiGenerateResult,
  ReviewReplyParams, ReviewAnalysisResult,
} from './interfaces/ai-provider.interface';

export type AICapability =
  | 'review_reply'
  | 'review_analysis'
  | 'sentiment'
  | 'business_summary'
  | 'weekly_insights'
  | 'spam_detection'
  | 'translation';

@Injectable()
export class AIService {
  private readonly logger = new Logger(AIService.name);
  private readonly providers: Map<string, IAIProvider>;
  private readonly defaultProviderName: string;

  constructor(
    private readonly config: ConfigService,
    private readonly openaiProvider: OpenAIProvider,
    private readonly geminiProvider: GeminiProvider,
    private readonly claudeProvider: ClaudeProvider,
  ) {
    this.defaultProviderName = this.config.get<string>('AI_DEFAULT_PROVIDER') || 'openai';
    this.providers = new Map<string, IAIProvider>([
      ['openai', openaiProvider],
      ['gemini', geminiProvider],
      ['claude', claudeProvider],
    ]);
  }

  private getProvider(providerName?: string): IAIProvider {
    const name = providerName || this.defaultProviderName;
    const provider = this.providers.get(name);
    if (!provider) {
      this.logger.warn(`AI provider "${name}" not found, falling back to openai`);
      return this.openaiProvider;
    }
    return provider;
  }

  /**
   * Generate AI review reply — the primary use case.
   * Falls back to OpenAI if the configured provider fails.
   */
  async generateReviewReply(
    params: ReviewReplyParams,
    options?: AiGenerateOptions & { provider?: string },
  ): Promise<AiGenerateResult> {
    const provider = this.getProvider(options?.provider);

    try {
      const result = await provider.generateReviewReply(params, options);
      this.logger.debug(`[AI] Reply generated via ${provider.providerName}: ${result.totalTokens ?? '?'} tokens, ${result.latencyMs}ms`);
      return result;
    } catch (err: any) {
      this.logger.error(`[AI] Provider ${provider.providerName} failed: ${err.message}`);

      // Fallback to OpenAI if primary provider fails
      if (provider.providerName !== 'openai') {
        this.logger.warn('[AI] Falling back to OpenAI provider');
        return this.openaiProvider.generateReviewReply(params, options);
      }
      throw err;
    }
  }

  /**
   * Analyze a review for category, emotion, and priority.
   */
  async analyzeReview(
    rating: number,
    reviewText: string,
    options?: AiGenerateOptions & { provider?: string },
  ): Promise<ReviewAnalysisResult> {
    const provider = this.getProvider(options?.provider);

    try {
      return await provider.analyzeReview(rating, reviewText, options);
    } catch (err: any) {
      this.logger.error(`[AI] analyzeReview via ${provider.providerName} failed: ${err.message}`);
      if (provider.providerName !== 'openai') {
        return this.openaiProvider.analyzeReview(rating, reviewText, options);
      }
      // Return graceful fallback on complete failure
      return {
        issueCategory: 'General',
        emotion: rating >= 4 ? 'Joy' : rating <= 2 ? 'Disappointment' : 'Neutral',
        sentiment: rating >= 4 ? 'positive' : rating <= 2 ? 'negative' : 'neutral',
        priority: rating <= 2 ? 'high' : 'medium',
        isSpam: false,
      };
    }
  }

  /**
   * Free-form text generation — for summaries, insights, translations, etc.
   */
  async generateText(
    prompt: string,
    capability: AICapability,
    options?: AiGenerateOptions & { provider?: string },
  ): Promise<AiGenerateResult> {
    const provider = this.getProvider(options?.provider);
    try {
      const result = await provider.generateText(prompt, options);
      this.logger.debug(`[AI] ${capability} via ${provider.providerName}: ${result.latencyMs}ms`);
      return result;
    } catch (err: any) {
      this.logger.error(`[AI] generateText (${capability}) via ${provider.providerName} failed: ${err.message}`);
      if (provider.providerName !== 'openai') {
        return this.openaiProvider.generateText(prompt, options);
      }
      throw err;
    }
  }

  /**
   * Generate weekly reputation insights summary for a business.
   */
  async generateWeeklyInsights(data: {
    businessName: string;
    totalReviews: number;
    avgRating: number;
    responseRate: number;
    topIssues: string[];
    sentiment: { positive: number; neutral: number; negative: number };
  }): Promise<string> {
    const prompt = `Generate a concise weekly reputation management insight report for "${data.businessName}".

Stats:
- Total reviews this week: ${data.totalReviews}
- Average rating: ${data.avgRating}/5
- Response rate: ${data.responseRate}%
- Top issues: ${data.topIssues.join(', ')}
- Sentiment: ${data.sentiment.positive}% positive, ${data.sentiment.neutral}% neutral, ${data.sentiment.negative}% negative

Write 3-4 sentences covering: key wins, areas needing attention, and one actionable recommendation. Professional tone.`;

    const result = await this.generateText(prompt, 'weekly_insights', { maxTokens: 200, temperature: 0.6 });
    return result.text;
  }

  /**
   * Check which providers are currently healthy.
   */
  async healthCheck(): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};
    for (const [name, provider] of this.providers) {
      results[name] = await provider.ping();
    }
    return results;
  }
}
