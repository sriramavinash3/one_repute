/**
 * services/whatsappService.js
 *
 * Sends WhatsApp alert messages to outlet managers for negative reviews.
 * Supports two providers: Twilio and 360dialog.
 * Provider is selected via WHATSAPP_PROVIDER environment variable.
 */

'use strict';

const https = require('https');
const env = require('../config/env');
const logger = require('../utils/logger');
const { withRetry } = require('../utils/retry');
const { isValidPhone } = require('../utils/validator');

// ─── Message Builder ──────────────────────────────────────────────────────────

/**
 * Build a structured WhatsApp alert message for the outlet manager.
 *
 * @param {Object} params
 * @param {string} params.outletName
 * @param {number} params.rating
 * @param {string} params.reviewText
 * @param {string} params.customerName
 * @param {string} params.aiSuggestedResponse
 * @returns {string}
 */
function buildAlertMessage({ outletName, rating, reviewText, customerName, aiSuggestedResponse }) {
  const stars = '⭐'.repeat(rating) + '☆'.repeat(5 - rating);
  const urgency = rating === 1 ? '🔴 URGENT' : rating === 2 ? '🟠 HIGH' : '🟡 MEDIUM';
  const suggestedSection = aiSuggestedResponse
    ? `---\n*💡 Suggested Reply:*\n"${aiSuggestedResponse}"\n\n`
    : '';

  return `🚨 *Negative Review Alert*

*Outlet:* ${outletName}
*Urgency:* ${urgency}
*Rating:* ${stars} (${rating}/5)
*Customer:* ${customerName}

*Review:*
"${reviewText || '(No comment provided)'}"

---
${suggestedSection}---
_Please review and respond via Google Business Profile._`;
}

// ─── Twilio Provider ──────────────────────────────────────────────────────────

/**
 * Send WhatsApp message via Twilio API.
 *
 * @param {string} to    - E.164 phone number
 * @param {string} body  - Message body
 * @returns {Promise<void>}
 */
async function sendViaTwilio(to, body) {
  const { accountSid, authToken, from } = env.whatsapp.twilio;

  if (!accountSid || !authToken || !from) {
    throw new Error('[WhatsApp] Missing Twilio credentials or from number');
  }

  const twilio = require('twilio');
  const client = twilio(accountSid, authToken);

  const normalizedFrom = from.startsWith('whatsapp:') ? from : `whatsapp:${from}`;
  const normalizedTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;

  const message = await client.messages.create({
    body,
    from: normalizedFrom,
    to: normalizedTo,
  });

  logger.debug('[WhatsApp] Twilio message queued', {
    sid: message.sid,
    status: message.status,
    to: normalizedTo,
    from: normalizedFrom,
    errorCode: message.errorCode || null,
    errorMessage: message.errorMessage || null,
  });
}

// ─── 360dialog Provider ───────────────────────────────────────────────────────

/**
 * Send WhatsApp message via 360dialog Cloud API.
 *
 * @param {string} to
 * @param {string} body
 * @returns {Promise<void>}
 */
async function sendVia360Dialog(to, body) {
  const { apiKey, fromNumber } = env.whatsapp.dialog360;

  const payload = JSON.stringify({
    messaging_product: 'whatsapp',
    to: to.replace('+', ''), // 360dialog uses numbers without +
    type: 'text',
    text: { body },
  });

  await new Promise((resolve, reject) => {
    const options = {
      hostname: 'waba.360dialog.io',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'D360-API-KEY': apiKey,
        'Content-Length': Buffer.byteLength(payload),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          logger.debug('[WhatsApp] 360dialog message sent', { to, status: res.statusCode });
          resolve();
        } else {
          reject(new Error(`360dialog API error: ${res.statusCode} ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// ─── Main Function ────────────────────────────────────────────────────────────

/**
 * Send a negative review alert via WhatsApp to the outlet manager.
 *
 * @param {Object} params
 * @param {string} params.toNumber          - Manager's phone in E.164 format
 * @param {string} params.outletName
 * @param {number} params.rating
 * @param {string} params.reviewText
 * @param {string} params.customerName
 * @param {string} params.aiSuggestedResponse
 * @returns {Promise<void>}
 */
async function sendNegativeReviewAlert(params) {
  const { toNumber } = params;

  if (!isValidPhone(toNumber)) {
    throw new Error(`Invalid WhatsApp number: ${toNumber}`);
  }

  const messageBody = buildAlertMessage(params);
  const provider = env.whatsapp.provider;

  await withRetry(
    async () => {
      if (provider === 'twilio') {
        await sendViaTwilio(toNumber, messageBody);
      } else if (provider === '360dialog') {
        await sendVia360Dialog(toNumber, messageBody);
      } else {
        throw new Error(`Unknown WhatsApp provider: ${provider}`);
      }
    },
    { retries: 3, baseDelayMs: 1000, label: `WhatsApp.sendAlert(${toNumber})` }
  );

  logger.info('[WhatsApp] Alert sent to manager', {
    to: toNumber,
    outletName: params.outletName,
    rating: params.rating,
    provider,
  });
}

module.exports = { sendNegativeReviewAlert };
