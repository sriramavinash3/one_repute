/**
 * src/modules/ai/providers/claude.provider.ts
 *
 * Anthropic Claude provider adapter (stubbed — activates when ANTHROPIC_API_KEY is set).
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  IAIProvider, AiGenerateOptions, AiGenerateResult,
  ReviewReplyParams, ReviewAnalysisResult,
} from '../interfaces/ai-provider.interface';

@Injectable()
export class ClaudeProvider implements IAIProvider {
  readonly providerName = 'claude';
  readonly supportsStreaming = true;
  private readonly logger = new Logger(ClaudeProvider.name);
  private client: any | null = null;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('ANTHROPIC_API_KEY');
    if (apiKey) {
      try {
        const Anthropic = require('@anthropic-ai/sdk');
        this.client = new Anthropic({ apiKey });
        this.logger.log('Claude provider initialized');
      } catch (err) {
        this.logger.warn('Claude provider unavailable: @anthropic-ai/sdk not installed');
      }
    }
  }

  private ensureClient(): void {
    if (!this.client) throw new Error('ClaudeProvider: ANTHROPIC_API_KEY not configured or package missing');
  }

  async generateText(prompt: string, options?: AiGenerateOptions): Promise<AiGenerateResult> {
    this.ensureClient();
    const start = Date.now();
    const model = options?.model || this.config.get<string>('ANTHROPIC_MODEL') || 'claude-3-haiku-20240307';

    const message = await this.client.messages.create({
      model,
      max_tokens: options?.maxTokens ?? 200,
      messages: [{ role: 'user', content: prompt }],
      ...(options?.systemPrompt ? { system: options.systemPrompt } : {}),
    });

    const text = (message.content[0] as any)?.text?.trim() || '';
    if (!text) throw new Error('[ClaudeProvider] Empty response');

    return { text, provider: this.providerName, model, latencyMs: Date.now() - start };
  }

  async generateReviewReply(params: ReviewReplyParams, options?: AiGenerateOptions): Promise<AiGenerateResult> {
    const { outletName, customerName, rating, reviewText, brandTone = 'friendly and professional', maxLength = 200 } = params;
    const stars = '⭐'.repeat(Math.max(1, Math.min(5, rating)));
    const prompt = `You are the ${brandTone} social media manager for "${outletName}". Write a SHORT (max ${maxLength} chars) human-like reply to this ${stars} review from "${customerName}": "${(reviewText || '').slice(0, 800)}". No emojis, include customer name.`;
    return this.generateText(prompt, options);
  }

  async analyzeReview(rating: number, reviewText: string, options?: AiGenerateOptions): Promise<ReviewAnalysisResult> {
    const prompt = `Analyze: Rating ${rating}/5, Review: "${reviewText?.slice(0, 1000)}". Return JSON: {issueCategory, emotion, sentiment, priority, isSpam, summary}`;
    const result = await this.generateText(prompt, options);
    try {
      const jsonMatch = result.text.match(/\{[\s\S]*\}/);
      const parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
      return { issueCategory: parsed.issueCategory || 'General', emotion: parsed.emotion || 'Neutral', sentiment: parsed.sentiment, priority: parsed.priority, isSpam: parsed.isSpam, summary: parsed.summary };
    } catch {
      return { issueCategory: 'General', emotion: 'Neutral', sentiment: 'neutral', priority: 'medium', isSpam: false };
    }
  }

  async ping(): Promise<boolean> {
    if (!this.client) return false;
    try { await this.generateText('Say ok', { maxTokens: 5 }); return true; }
    catch { return false; }
  }
}
