'use strict';

const { google } = require('googleapis');
const env = require('../config/env');
const logger = require('../utils/logger');
const { encrypt, decrypt } = require('../utils/crypto');

const SCOPES = [
  'https://www.googleapis.com/auth/business.manage',
  'https://www.googleapis.com/auth/userinfo.email',
  'openid'
];

function createOAuthClient(outlet) {
  const oauth2Client = new google.auth.OAuth2(
    env.google.clientId,
    env.google.clientSecret,
    env.google.redirectUri
  );

  // If an outlet with a refresh token is provided, set credentials
  if (outlet?.googleRefreshToken) {
    oauth2Client.setCredentials({
      refresh_token: outlet.googleRefreshToken,
    });
  }

  return oauth2Client;
}

function getConsentUrl(outletId) {
  const oauth2Client = createOAuthClient();
  const state = outletId ? encodeURIComponent(outletId) : undefined;

  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: SCOPES,
    state,
  });
}

async function exchangeCodeForTokens(code) {
  const oauth2Client = createOAuthClient();
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  return { oauth2Client, tokens };
}

function extractId(resourceName) {
  if (!resourceName) return '';
  const parts = String(resourceName).split('/');
  return parts[parts.length - 1] || '';
}

async function fetchAccountEmail(oauth2Client) {
  try {
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data } = await oauth2.userinfo.get();
    return data?.email || '';
  } catch (err) {
    logger.warn('[GoogleOAuth] Failed to fetch account email', { error: err.message });
    return '';
  }
}

async function fetchAccountsAndLocations(oauth2Client) {
  const accountClient = google.mybusinessaccountmanagement({
    version: 'v1',
    auth: oauth2Client,
  });

  const locationClient = google.mybusinessbusinessinformation({
    version: 'v1',
    auth: oauth2Client,
  });

  const accountsResponse = await accountClient.accounts.list();
  const accounts = accountsResponse.data.accounts || [];

  const locations = [];
  let primaryAccountId = '';

  for (const account of accounts) {
    const accountId = extractId(account.name);

    if (!primaryAccountId) {
      primaryAccountId = accountId;
    }

    try {
      const response = await locationClient.accounts.locations.list({
        parent: account.name,
        readMask: 'name,title',
      });

      const accountLocations = (response.data.locations || [])
        .map((location) => ({
          id: extractId(location.name),
          name: location.title || location.name || 'Unnamed location',
        }))
        .filter((location) => location.id);

      locations.push(...accountLocations);
    } catch (err) {
      logger.warn('[GoogleOAuth] Failed to fetch locations', {
        accountId,
        error: err.message,
      });
    }
  }

  return { accountId: primaryAccountId, locations };
}

module.exports = {
  createOAuthClient,
  getConsentUrl,
  exchangeCodeForTokens,
  fetchAccountEmail,
  fetchAccountsAndLocations,
  encryptToken: encrypt,
  decryptToken: decrypt,
};
