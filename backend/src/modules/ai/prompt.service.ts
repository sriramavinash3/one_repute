/**
 * src/modules/ai/prompt.service.ts
 *
 * Manages versioned prompt templates with variable interpolation.
 * Supports per-org overrides and brand tone injection.
 */

import { Injectable, Logger } from '@nestjs/common';

export interface PromptVariable {
  name: string;
  value: string | number;
}

export interface PromptTemplate {
  id: string;
  name: string;
  version: number;
  template: string;
  systemPrompt?: string;
  variables: string[];
  locale?: string;
  category: string;
}

/** Built-in prompt templates */
const BUILT_IN_PROMPTS: Record<string, PromptTemplate> = {
  'review_reply_default': {
    id: 'review_reply_default',
    name: 'Review Reply (Default)',
    version: 1,
    template: `You are the {{brandTone}} social media manager for "{{outletName}}".

Customer name: "{{customerName}}"

A customer left this {{stars}} review:
"{{reviewText}}"

Write a SHORT, human-like public reply.

STRICT RULES:
- Max length: {{maxLength}} characters.
- Tone: {{brandTone}}.
- Do NOT use any emojis.
- ALWAYS include the customer's name naturally in the reply.
- Sound like a real person, not a bot.
- Reference something specific from the review if possible.
- Avoid corporate or marketing jargon.
- Do NOT start with "Thank you for your review".
- Reply ONLY with the response text. No quotes, no labels.`,
    systemPrompt: 'You are an expert at writing short, authentic, context-aware customer review responses.',
    variables: ['outletName', 'customerName', 'stars', 'reviewText', 'brandTone', 'maxLength'],
    category: 'review_reply',
  },
  'review_analysis': {
    id: 'review_analysis',
    name: 'Review Analysis',
    version: 1,
    template: `Analyze the following customer review and extract information as a JSON object.

Customer Rating: {{rating}}/5
Review Text: "{{reviewText}}"

Return ONLY valid JSON with these keys:
- "issueCategory": one of "Service Speed", "Food Quality", "Hygiene", "Staff Behavior", "Pricing", "Ambience", "General"
- "emotion": one of "Joy", "Anger", "Disappointment", "Neutral"
- "sentiment": one of "positive", "neutral", "negative"
- "priority": one of "high", "medium", "low"
- "isSpam": boolean
- "summary": one sentence summary`,
    systemPrompt: 'You are a data categorization assistant that outputs ONLY valid JSON.',
    variables: ['rating', 'reviewText'],
    category: 'analysis',
  },
  'weekly_insights': {
    id: 'weekly_insights',
    name: 'Weekly Reputation Insights',
    version: 1,
    template: `Generate a concise weekly reputation management insight report for "{{businessName}}".

Stats:
- Total reviews this week: {{totalReviews}}
- Average rating: {{avgRating}}/5
- Response rate: {{responseRate}}%
- Top issues: {{topIssues}}
- Sentiment: {{positivePct}}% positive, {{neutralPct}}% neutral, {{negativePct}}% negative

Write 3-4 sentences covering key wins, areas needing attention, and one actionable recommendation. Professional tone.`,
    variables: ['businessName', 'totalReviews', 'avgRating', 'responseRate', 'topIssues', 'positivePct', 'neutralPct', 'negativePct'],
    category: 'insights',
  },
};

@Injectable()
export class PromptService {
  private readonly logger = new Logger(PromptService.name);
  private orgOverrides: Map<string, Partial<PromptTemplate>> = new Map();

  /**
   * Get a prompt template by ID, with optional org-specific override applied.
   */
  getTemplate(promptId: string, orgId?: string): PromptTemplate | null {
    const base = BUILT_IN_PROMPTS[promptId];
    if (!base) return null;

    if (orgId) {
      const overrideKey = `${orgId}:${promptId}`;
      const override = this.orgOverrides.get(overrideKey);
      if (override) {
        return { ...base, ...override };
      }
    }

    return base;
  }

  /**
   * Render a prompt template by substituting variables.
   */
  render(templateId: string, variables: Record<string, string | number>, orgId?: string): { prompt: string; systemPrompt?: string } | null {
    const template = this.getTemplate(templateId, orgId);
    if (!template) {
      this.logger.warn(`[PromptService] Template not found: ${templateId}`);
      return null;
    }

    let rendered = template.template;
    for (const [key, value] of Object.entries(variables)) {
      rendered = rendered.replaceAll(`{{${key}}}`, String(value));
    }

    return {
      prompt: rendered,
      systemPrompt: template.systemPrompt,
    };
  }

  /**
   * Set an org-specific override for a prompt template.
   * Persisted in-memory for this session; should be backed by DB in production.
   */
  setOrgOverride(orgId: string, promptId: string, override: Partial<PromptTemplate>): void {
    const key = `${orgId}:${promptId}`;
    this.orgOverrides.set(key, override);
    this.logger.log(`[PromptService] Org override set: org=${orgId}, prompt=${promptId}`);
  }

  /**
   * List all available prompt templates.
   */
  listTemplates(): PromptTemplate[] {
    return Object.values(BUILT_IN_PROMPTS);
  }
}
