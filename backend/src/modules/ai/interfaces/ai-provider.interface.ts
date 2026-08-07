/**
 * src/modules/ai/interfaces/ai-provider.interface.ts
 *
 * Common contract every AI provider must implement.
 * Business logic NEVER calls a specific provider directly —
 * it only depends on this interface via AIService.
 */

export interface AiGenerateOptions {
  model?: string;
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  responseFormat?: 'text' | 'json';
}

export interface AiGenerateResult {
  text: string;
  provider: string;
  model: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  latencyMs: number;
}

export interface ReviewReplyParams {
  outletName: string;
  customerName: string;
  rating: number;
  reviewText: string;
  type?: 'positive' | 'neutral' | 'negative';
  brandTone?: string;
  language?: string;
  maxLength?: number;
}

export interface ReviewAnalysisResult {
  issueCategory: string;
  emotion: string;
  sentiment?: 'positive' | 'neutral' | 'negative';
  priority?: 'high' | 'medium' | 'low';
  isSpam?: boolean;
  summary?: string;
}

export interface IAIProvider {
  readonly providerName: string;
  readonly supportsStreaming: boolean;

  /** Generate free-form text from a prompt */
  generateText(prompt: string, options?: AiGenerateOptions): Promise<AiGenerateResult>;

  /** Generate a human-like reply for a customer review */
  generateReviewReply(params: ReviewReplyParams, options?: AiGenerateOptions): Promise<AiGenerateResult>;

  /** Analyze a review for category, emotion, and sentiment */
  analyzeReview(rating: number, reviewText: string, options?: AiGenerateOptions): Promise<ReviewAnalysisResult>;

  /** Health check — verifies the provider is reachable */
  ping(): Promise<boolean>;
}
