import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google } from 'googleapis';
import { FirebaseService } from '../firebase/firebase.service';
import { decryptToken } from '../../common/utils/token-encryption.util';

const SCOPES = [
  'https://www.googleapis.com/auth/business.manage',
  'https://www.googleapis.com/auth/userinfo.email',
  'openid'
];

@Injectable()
export class GoogleBusinessService {
  private readonly logger = new Logger(GoogleBusinessService.name);
  private quotaExceeded = false;

  constructor(
    private readonly configService: ConfigService,
    private readonly firebaseService: FirebaseService,
  ) {}

  private resolveRedirectUri(): string {
    const explicit = this.configService.get<string>('GOOGLE_REDIRECT_URI');
    if (explicit) {
      return explicit;
    }

    const isProduction = this.configService.get<boolean>('app.isProduction');
    const appUrlConfig = this.configService.get<string>('app.appUrl');

    // In local development, ensure redirect_uri uses http://localhost:3000 unless explicit GOOGLE_REDIRECT_URI is provided
    let baseAppUrl = appUrlConfig || (isProduction ? 'https://api.onerepute.com' : 'http://localhost:3000');
    if (!isProduction && baseAppUrl.includes('onerepute.com')) {
      baseAppUrl = 'http://localhost:3000';
    }

    const appUrl = baseAppUrl.replace(/\/+$/, '');
    return `${appUrl}/api/auth/google/callback`;
  }

  createOAuthClient(googleRefreshToken?: string) {
    const clientId = this.configService.get<string>('GOOGLE_CLIENT_ID');
    const clientSecret = this.configService.get<string>('GOOGLE_CLIENT_SECRET');
    const redirectUri = this.resolveRedirectUri();

    // Decrypt token if it is stored encrypted (iv:authTag:ciphertext format)
    const rawToken = googleRefreshToken ? decryptToken(googleRefreshToken) : undefined;

    // Safe structural logging — no secrets, no auth codes, no refresh tokens.
    this.logger.debug(`Google OAuth config: clientId=${clientId ? 'set' : 'MISSING'} clientSecret=${clientSecret ? 'set' : 'MISSING'} redirectUri=${redirectUri} tokenPresent=${!!rawToken}`);

    const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

    if (rawToken) {
      oauth2Client.setCredentials({
        refresh_token: rawToken,
      });
    }

    return oauth2Client;
  }

  getConsentUrl(outletId?: string): string {
    const oauth2Client = this.createOAuthClient();
    // Pass the raw value — generateAuthUrl applies proper query encoding exactly once.
    const state = outletId || undefined;

    const consentUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: SCOPES,
      state,
    });

    // Safe logging of generated OAuth request parameters without sensitive secrets or tokens
    try {
      const parsed = new URL(consentUrl);
      this.logger.log(
        `Generated Google OAuth URL: client_id=${parsed.searchParams.get('client_id')} ` +
        `redirect_uri=${parsed.searchParams.get('redirect_uri')} ` +
        `response_type=${parsed.searchParams.get('response_type')} ` +
        `scope=${parsed.searchParams.get('scope')} ` +
        `access_type=${parsed.searchParams.get('access_type')} ` +
        `prompt=${parsed.searchParams.get('prompt')} ` +
        `state_present=${!!parsed.searchParams.get('state')}`
      );
    } catch (e) {
      this.logger.warn(`Failed to parse consentUrl: ${e.message}`);
    }

    return consentUrl;
  }

  async exchangeCodeForTokens(code: string) {
    const oauth2Client = this.createOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);
    return { oauth2Client, tokens };
  }

  async fetchAccountEmail(oauth2Client: any): Promise<string> {
    try {
      const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
      const { data } = await oauth2.userinfo.get();
      return data?.email || '';
    } catch (err: any) {
      this.logger.warn(`Failed to fetch account email: ${err.message}`);
      return '';
    }
  }

  private extractId(resourceName?: string): string {
    if (!resourceName) return '';
    const parts = String(resourceName).split('/');
    return parts[parts.length - 1] || '';
  }

  async fetchAccountsAndLocations(oauth2Client: any) {
    try {
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

      const locations: any[] = [];
      let primaryAccountId = '';

      for (const account of accounts) {
        const accountId = this.extractId(account.name);

        if (!primaryAccountId) {
          primaryAccountId = accountId;
        }

        try {
          const response = await locationClient.accounts.locations.list({
            parent: account.name,
            readMask: 'name,title',
          });

          const accountLocations = (response.data.locations || [])
            .map((location: any) => ({
              id: this.extractId(location.name),
              name: location.title || location.name || 'Unnamed location',
            }))
            .filter((location: any) => location.id);

          locations.push(...accountLocations);
        } catch (err: any) {
          this.logger.warn(`Failed to fetch locations for account ${accountId}: ${err.message}`);
        }
      }

      return { accountId: primaryAccountId, locations };
    } catch (err: any) {
      this.logger.warn(`Failed to fetch accounts/locations: ${err.message}`);
      return { accountId: '', locations: [] };
    }
  }

  async fetchReviews(googleAccountId: string, googleLocationId: string, googleRefreshToken: string): Promise<any[]> {
    const auth = this.createOAuthClient(googleRefreshToken);
    const allReviews: any[] = [];
    let nextPageToken: string | undefined = undefined;
    
    const cleanAccountId = this.extractId(googleAccountId);
    const cleanLocationId = this.extractId(googleLocationId);
    const locationName = `accounts/${cleanAccountId}/locations/${cleanLocationId}`;

    do {
      const response = await this.handleQuotaErrors(async () => {
        const res = await auth.request({
          url: `https://mybusiness.googleapis.com/v4/${locationName}/reviews`,
          method: 'GET',
          params: {
            pageSize: 50,
            pageToken: nextPageToken,
            orderBy: 'updateTime desc',
          },
        });
        return res.data as any;
      });

      const reviews = response.reviews || [];
      allReviews.push(...reviews);
      nextPageToken = response.nextPageToken;

      if (allReviews.length >= 500) {
        this.logger.warn(`Hit max reviews fetch limit (500) for location: ${cleanLocationId}`);
        break;
      }
    } while (nextPageToken);

    this.logger.log(`Fetched ${allReviews.length} reviews for location: ${cleanLocationId}`);
    return allReviews;
  }

  async postReply(googleAccountId: string, googleLocationId: string, googleRefreshToken: string, reviewResourceName: string, replyText: string): Promise<void> {
    const auth = this.createOAuthClient(googleRefreshToken);
    
    // Ensure reviewResourceName is correctly formatted
    const cleanResourceName = reviewResourceName.startsWith('accounts/') 
      ? reviewResourceName 
      : `accounts/${this.extractId(googleAccountId)}/locations/${this.extractId(googleLocationId)}/reviews/${reviewResourceName}`;

    await this.handleQuotaErrors(async () => {
      await auth.request({
        url: `https://mybusiness.googleapis.com/v4/${cleanResourceName}/reply`,
        method: 'PUT',
        data: {
          comment: replyText,
        },
      });
    });
    this.logger.log(`Reply posted successfully to review ${cleanResourceName}`);
  }

  private async handleQuotaErrors<T>(apiCall: () => Promise<T>, retries = 3): Promise<T> {
    if (this.quotaExceeded) {
      throw new Error('API processing suspended due to previous quota limit hit. Please wait for cooldown.');
    }

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await apiCall();
      } catch (err: any) {
        const isInvalidGrant =
          /invalid_grant/i.test(err?.message || '') ||
          err?.response?.data?.error === 'invalid_grant' ||
          /invalid_token/i.test(err?.message || '');

        if (isInvalidGrant) {
          this.logger.error(`Google OAuth token invalid/revoked (invalid_grant). Aborting retries.`);
          throw new Error(`invalid_grant: Google account authorization revoked or expired. Please reconnect.`);
        }

        const isQuotaError =
          err?.code === 429 ||
          err?.response?.status === 429 ||
          /quota\s+exceeded/i.test(err?.message || '');

        if (isQuotaError) {
          this.quotaExceeded = true;
          setTimeout(() => { this.quotaExceeded = false; }, 15 * 60 * 1000);
          this.logger.error(`Critical: Quota exceeded. Suspending all API calls. error: ${err.message}`);
          throw err;
        } else {
          throw err;
        }
      }
    }
    throw new Error('Max retries reached for API call');
  }

  resetQuotaFlag() {
    this.quotaExceeded = false;
  }
}
