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

module.exports = { generateReply };
