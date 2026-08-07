/**
 * src/modules/ai/providers/openai.provider.ts
 *
 * OpenAI provider adapter — the default AI provider.
 * Preserves the existing aicredits.in base URL and prompt logic.
 */

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import {
  IAIProvider,
  AiGenerateOptions,
  AiGenerateResult,
  ReviewReplyParams,
  ReviewAnalysisResult,
} from '../interfaces/ai-provider.interface';

@Injectable()
export class OpenAIProvider implements IAIProvider {
  readonly providerName = 'openai';
  readonly supportsStreaming = true;

  private readonly logger = new Logger(OpenAIProvider.name);
  private readonly client: OpenAI;
  private readonly defaultModel: string;
  private readonly defaultTemp: number;
  private readonly defaultMaxTokens: number;

  constructor(private readonly config: ConfigService) {
    this.client = new OpenAI({
      apiKey: this.config.get<string>('OPENAI_API_KEY'),
      baseURL: this.config.get<string>('OPENAI_BASE_URL') || 'https://api.aicredits.in/v1',
    });
    this.defaultModel = this.config.get<string>('OPENAI_MODEL') || 'gpt-4o-mini';
    this.defaultTemp = Number(this.config.get<string>('OPENAI_TEMPERATURE') || '0.75');
    this.defaultMaxTokens = Number(this.config.get<string>('OPENAI_MAX_TOKENS') || '150');
  }

  async generateText(prompt: string, options?: AiGenerateOptions): Promise<AiGenerateResult> {
    const start = Date.now();
    const model = options?.model || this.defaultModel;

    const response = await this.client.chat.completions.create({
      model,
      temperature: options?.temperature ?? this.defaultTemp,
      max_tokens: options?.maxTokens ?? this.defaultMaxTokens,
      ...(options?.responseFormat === 'json' ? { response_format: { type: 'json_object' as const } } : {}),
      messages: [
        ...(options?.systemPrompt ? [{ role: 'system' as const, content: options.systemPrompt }] : []),
        { role: 'user' as const, content: prompt },
      ],
    });

    const text = response.choices[0]?.message?.content?.trim() || '';
    if (!text) throw new Error('[OpenAIProvider] Empty response from API');

    return {
      text,
      provider: this.providerName,
      model,
      promptTokens: response.usage?.prompt_tokens,
      completionTokens: response.usage?.completion_tokens,
      totalTokens: response.usage?.total_tokens,
      latencyMs: Date.now() - start,
    };
  }

  async generateReviewReply(params: ReviewReplyParams, options?: AiGenerateOptions): Promise<AiGenerateResult> {
    const {
      outletName,
      customerName,
      rating,
      reviewText,
      brandTone = 'friendly and professional',
      maxLength = 200,
    } = params;

    const stars = '⭐'.repeat(Math.max(1, Math.min(5, rating)));
    const prompt = `You are the ${brandTone} social media manager for "${outletName}".

Customer name: "${customerName || 'Customer'}"

A customer left this ${stars} review:
"${(reviewText || '').slice(0, 1000) || '(No comment — just a star rating)'}"

Write a SHORT, human-like public reply.

STRICT RULES:
- Max length: ${maxLength} characters.
- Tone: ${brandTone}.
- Do NOT use any emojis.
- ALWAYS include the customer's name naturally in the reply.
- Sound like a real person, not a bot.
- Reference something specific from the review if possible.
- Avoid corporate or marketing jargon.
- Do NOT start with "Thank you for your review".
- Reply ONLY with the response text. No quotes, no labels.`;

    return this.generateText(prompt, {
      systemPrompt: 'You are an expert at writing short, authentic, context-aware customer review responses. You always follow the rules exactly.',
      maxTokens: options?.maxTokens ?? 150,
      temperature: options?.temperature ?? this.defaultTemp,
      model: options?.model ?? this.defaultModel,
    });
  }

  async analyzeReview(rating: number, reviewText: string, options?: AiGenerateOptions): Promise<ReviewAnalysisResult> {
    if (!reviewText?.trim()) {
      return {
        issueCategory: 'General',
        emotion: rating >= 4 ? 'Joy' : rating <= 2 ? 'Disappointment' : 'Neutral',
        sentiment: rating >= 4 ? 'positive' : rating <= 2 ? 'negative' : 'neutral',
        priority: rating <= 2 ? 'high' : rating <= 3 ? 'medium' : 'low',
        isSpam: false,
      };
    }

    const prompt = `Analyze the following customer review and extract information as a JSON object.

Customer Rating: ${rating}/5
Review Text: "${reviewText.slice(0, 2000)}"

Return ONLY valid JSON with these keys:
- "issueCategory": one of "Service Speed", "Food Quality", "Hygiene", "Staff Behavior", "Pricing", "Ambience", "General"
- "emotion": one of "Joy", "Anger", "Disappointment", "Neutral"
- "sentiment": one of "positive", "neutral", "negative"
- "priority": one of "high", "medium", "low"
- "isSpam": boolean
- "summary": one sentence summary of the review`;

    const result = await this.generateText(prompt, {
      systemPrompt: 'You are a data categorization assistant that outputs ONLY valid JSON.',
      responseFormat: 'json',
      maxTokens: 150,
      temperature: 0.1,
      model: options?.model ?? this.defaultModel,
    });

    try {
      const parsed = JSON.parse(result.text);
      return {
        issueCategory: parsed.issueCategory || 'General',
        emotion: parsed.emotion || 'Neutral',
        sentiment: parsed.sentiment || 'neutral',
        priority: parsed.priority || 'medium',
        isSpam: parsed.isSpam || false,
        summary: parsed.summary || '',
      };
    } catch {
      return { issueCategory: 'General', emotion: 'Neutral', sentiment: 'neutral', priority: 'medium', isSpam: false };
    }
  }

  async ping(): Promise<boolean> {
    try {
      await this.generateText('Say "ok"', { maxTokens: 5, temperature: 0 });
      return true;
    } catch {
      return false;
    }
  }
}
