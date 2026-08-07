/**
 * src/modules/ai/providers/gemini.provider.ts
 *
 * Google Gemini provider adapter (stubbed — activates when GEMINI_API_KEY is set).
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  IAIProvider, AiGenerateOptions, AiGenerateResult,
  ReviewReplyParams, ReviewAnalysisResult,
} from '../interfaces/ai-provider.interface';

@Injectable()
export class GeminiProvider implements IAIProvider {
  readonly providerName = 'gemini';
  readonly supportsStreaming = true;
  private readonly logger = new Logger(GeminiProvider.name);
  private client: any | null = null;

  constructor(private readonly config: ConfigService) {
    const apiKey = this.config.get<string>('GEMINI_API_KEY');
    if (apiKey) {
      try {
        // Lazy-import to avoid hard crash if package not installed
        const { GoogleGenerativeAI } = require('@google/generative-ai');
        this.client = new GoogleGenerativeAI(apiKey);
        this.logger.log('Gemini provider initialized');
      } catch (err) {
        this.logger.warn('Gemini provider unavailable: @google/generative-ai not installed');
      }
    }
  }

  private ensureClient(): void {
    if (!this.client) throw new Error('GeminiProvider: GEMINI_API_KEY not configured or package missing');
  }

  async generateText(prompt: string, options?: AiGenerateOptions): Promise<AiGenerateResult> {
    this.ensureClient();
    const start = Date.now();
    const modelName = options?.model || this.config.get<string>('GEMINI_MODEL') || 'gemini-1.5-flash';
    const model = this.client.getGenerativeModel({ model: modelName });
    const result = await model.generateContent(prompt);
    const text = result.response.text()?.trim() || '';
    if (!text) throw new Error('[GeminiProvider] Empty response');
    return { text, provider: this.providerName, model: modelName, latencyMs: Date.now() - start };
  }

  async generateReviewReply(params: ReviewReplyParams, options?: AiGenerateOptions): Promise<AiGenerateResult> {
    const { outletName, customerName, rating, reviewText, brandTone = 'friendly and professional', maxLength = 200 } = params;
    const stars = '⭐'.repeat(Math.max(1, Math.min(5, rating)));
    const prompt = `You are the ${brandTone} social media manager for "${outletName}". Reply to this ${stars} review from "${customerName}": "${(reviewText || '').slice(0, 800)}". Max ${maxLength} chars. No emojis. Human tone. Include customer name.`;
    return this.generateText(prompt, options);
  }

  async analyzeReview(rating: number, reviewText: string, options?: AiGenerateOptions): Promise<ReviewAnalysisResult> {
    const prompt = `Analyze: Rating ${rating}/5, Review: "${reviewText?.slice(0, 1000)}". Return JSON: {issueCategory, emotion, sentiment, priority, isSpam, summary}`;
    const result = await this.generateText(prompt, { ...options, responseFormat: 'json' });
    try {
      const parsed = JSON.parse(result.text);
      return { issueCategory: parsed.issueCategory || 'General', emotion: parsed.emotion || 'Neutral', sentiment: parsed.sentiment, priority: parsed.priority, isSpam: parsed.isSpam, summary: parsed.summary };
    } catch {
      return { issueCategory: 'General', emotion: 'Neutral', sentiment: 'neutral', priority: 'medium', isSpam: false };
    }
  }

  async ping(): Promise<boolean> {
    if (!this.client) return false;
    try {
      await this.generateText('Say ok', { maxTokens: 5 });
      return true;
    } catch {
      return false;
    }
  }
}
