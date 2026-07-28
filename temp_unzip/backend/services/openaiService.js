/**
 * services/openaiService.js
 *
 * Generates context-aware, human-like review replies using OpenAI's chat API.
 * Each outlet and rating gets a tailored prompt — no generic templates.
 */

'use strict';

const OpenAI = require('openai');
const env = require('../config/env');
const logger = require('../utils/logger');
const { withRetry } = require('../utils/retry');
const { sanitizeString } = require('../utils/validator');

const openai = new OpenAI({
  apiKey: env.openai.apiKey,
  baseURL: 'https://api.aicredits.in/v1',
});

// ─── Prompt Builder ───────────────────────────────────────────────────────────

/**
 * Build a context-aware prompt based on outlet, rating, and review text.
 * Positive (4-5) and escalation (1-3) prompts have different tones.
 *
 * @param {Object} params
 * @param {string} params.outletName
 * @param {number} params.rating
 * @param {string} params.reviewText
 * @param {'positive'|'neutral'|'negative'} params.type
 * @returns {string}
 */
function buildPrompt({ outletName, customerName, rating, reviewText, type }) {
  const stars = '⭐'.repeat(rating);
  const selectedTone = 'friendly and professional';
  const limit = 200;
  const emojiRule = 'Do NOT use any emojis.';

  return `You are the ${selectedTone} social media manager for "${outletName}".

  Customer name: "${customerName || 'Customer'}"

  A customer left this ${stars} review:
  "${reviewText || '(No comment — just a star rating)'}"

  Write a SHORT, human-like public reply.
  
  STRICT RULES:
  - Max length: ${limit} characters.
  - Tone: ${selectedTone}.
  - ${emojiRule}
  - ALWAYS include the customer's name naturally in the reply.
  - Sound like a real person, not a bot.
  - Reference something specific from the review if possible.
  - Avoid corporate or marketing jargon.
  - Do NOT start with "Thank you for your review".
  - Reply ONLY with the response text. No quotes, no labels.`;
}

/**
 * Generate an AI reply for a review.
 *
 * @param {Object} params
 * @param {string} params.outletName
 * @param {number} params.rating
 * @param {string} params.reviewText
 * @param {'positive'|'neutral'|'negative'} params.type
 * @returns {Promise<string>} - Generated reply text
 */
async function generateReply({ outletName, customerName, rating, reviewText, type }) {
  const safeOutletName = sanitizeString(outletName, 100);
  const safeReviewText = sanitizeString(reviewText, 2000);
  const safeCustomerName = sanitizeString(customerName, 80);
  
  const prompt = buildPrompt({ 
    outletName: safeOutletName, 
    customerName: safeCustomerName, 
    rating, 
    reviewText: safeReviewText, 
    type,
  });

  const reply = await withRetry(
    async () => {
      const response = await openai.chat.completions.create({
        model: env.openai.model,
        max_tokens: env.openai.maxTokens,
        temperature: env.openai.temperature,
        messages: [
          {
            role: 'system',
            content:
              'You are an expert at writing short, authentic, context-aware customer review responses. You always follow the rules exactly and never add filler text.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      console.log(response?.choices?.[0]?.message?.content?.trim() + "\n\n");

      const text = response?.choices?.[0]?.message?.content?.trim();

      if (!text) {
        logger.error('[OpenAI] Invalid API response', {
          response: JSON.stringify(response).slice(0, 500),
        });

        throw new Error('AI provider returned empty response');
      }
      
      return text;
    },
    { retries: 3, baseDelayMs: 1000, label: 'OpenAI.generateReply' }
  );

  logger.debug('[OpenAI] Generated reply', {
    outletName: safeOutletName,
    rating,
    type,
    replyLength: reply.length,
  });

  return reply;
}

/**
 * Analyze a review to extract issue category and emotion.
 *
 * @param {Object} params
 * @param {number} params.rating
 * @param {string} params.reviewText
 * @returns {Promise<{issueCategory: string, emotion: string}>}
 */
async function analyzeReview({ rating, reviewText }) {
  if (!reviewText || reviewText.trim().length === 0) {
    return {
      issueCategory: 'General',
      emotion: rating >= 4 ? 'Joy' : (rating <= 2 ? 'Disappointment' : 'Neutral')
    };
  }

  const safeReviewText = sanitizeString(reviewText, 2000);
  
  const prompt = `Analyze the following customer review and extract two pieces of information:
1. issueCategory: Categorize the core subject of the review into exactly one of these options: "Service Speed", "Food Quality", "Hygiene", "Staff Behavior", "Pricing", "Ambience", "General". (Use "General" if none apply).
2. emotion: The primary emotion expressed by the customer. Choose exactly one of: "Joy", "Anger", "Disappointment", "Neutral".

Customer Rating: ${rating}/5
Review Text: "${safeReviewText}"

Return the result as a valid JSON object with the keys "issueCategory" and "emotion".`;

  const result = await withRetry(
    async () => {
      const response = await openai.chat.completions.create({
        model: env.openai.model,
        max_tokens: 100,
        temperature: 0.1,
        response_format: { type: "json_object" },
        messages: [
          {
            role: 'system',
            content: 'You are a helpful data categorization assistant that outputs ONLY valid JSON.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const text = response?.choices?.[0]?.message?.content?.trim();
      if (!text) {
        throw new Error('AI provider returned empty response for analysis');
      }
      
      const parsed = JSON.parse(text);
      return {
        issueCategory: parsed.issueCategory || 'General',
        emotion: parsed.emotion || 'Neutral'
      };
    },
    { retries: 3, baseDelayMs: 1000, label: 'OpenAI.analyzeReview' }
  );

  return result;
}

module.exports = { generateReply, analyzeReview };
