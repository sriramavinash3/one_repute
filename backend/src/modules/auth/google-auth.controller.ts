import { Controller, Get, Post, Query, Body, Res, Req, Logger, HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Response, Request } from 'express';
import { GoogleBusinessService } from '../google-business/google-business.service';
import { FirebaseService } from '../firebase/firebase.service';
import * as crypto from 'crypto';

@Controller('auth/google')
export class GoogleAuthController {
  private readonly logger = new Logger(GoogleAuthController.name);
  private readonly encryptionKey: Buffer;

  constructor(
    private readonly configService: ConfigService,
    private readonly googleBusinessService: GoogleBusinessService,
    private readonly firebaseService: FirebaseService,
  ) {
    const key = this.configService.get<string>('app.encryptionKey') || '';
    this.encryptionKey = crypto.createHash('sha256').update(key).digest();
  }

  /**
   * Validates an id that will be embedded in an OAuth URL.
   * Rejects values that would produce malformed URLs such as
   * ?outletId=%22%22 (a literal `""` from JSON.stringify('')), undefined, null,
   * whitespace, or values containing URL-unsafe quote characters.
   */
  private sanitizeId(raw: string | undefined, paramName: string): string {
    const value = raw == null ? '' : String(raw).trim();
    if (!value) {
      throw new HttpException(`${paramName} is missing or empty`, HttpStatus.BAD_REQUEST);
    }
    if (value.includes('"') || value.includes('%22') || /^\{.*\}$/.test(value)) {
      this.logger.warn(`Malformed ${paramName} rejected: ${JSON.stringify(raw)} (source value looks like serialized JSON/quote-wrapped data)`);
      throw new HttpException(
        `${paramName} is malformed: it contains quote characters and cannot be used in an OAuth URL`,
        HttpStatus.BAD_REQUEST,
      );
    }
    return value;
  }

  private encrypt(text: string): string {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted.toString('hex');
  }

  private decrypt(encryptedText: string): string {
    const [ivHex, authTagHex, encryptedHex] = encryptedText.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const encrypted = Buffer.from(encryptedHex, 'hex');
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  }

  @Get('onboard')
  async onboard(
    @Query('uid') uid: string,
    @Query('selectAccount') selectAccount: string,
    @Res() res: Response
  ) {
    const safeUid = this.sanitizeId(uid, 'uid');

    this.logger.log(`[Onboarding] Session created: uid=${safeUid}`);

    const db = this.firebaseService.getDb();
    await db.collection('onboarding_sessions').doc(safeUid).set({
      status: 'loading',
      createdAt: new Date(),
      updatedAt: new Date(),
    }, { merge: true });

    this.logger.log(`[Onboarding] Session status updated: loading for uid=${safeUid}`);

    // Encrypt uid into state so it cannot be tampered with in the OAuth redirect
    const encryptedState = this.encrypt(JSON.stringify({ uid: safeUid, ts: Date.now() }));
    const consentUrl = this.googleBusinessService.getConsentUrl(encryptedState, selectAccount === 'true');

    return res.redirect(consentUrl);
  }

  @Get()
  async initiate(
    @Query('outletId') outletId: string,
    @Query('uid') uid: string,
    @Query('selectAccount') selectAccount: string,
    @Res() res: Response
  ) {
    const safeOutletId = outletId ? this.sanitizeId(outletId, 'outletId') : 'default';
    const safeUid = uid ? this.sanitizeId(uid, 'uid') : undefined;

    this.logger.log(`Initiating Google OAuth for outlet: outletId=${safeOutletId}${safeUid ? `, uid=${safeUid}` : ''}`);

    const statePayload = safeUid
      ? { uid: safeUid, outletId: safeOutletId, ts: Date.now() }
      : { outletId: safeOutletId, ts: Date.now() };
    const encryptedState = this.encrypt(JSON.stringify(statePayload));
    const consentUrl = this.googleBusinessService.getConsentUrl(encryptedState, selectAccount === 'true');

    return res.redirect(consentUrl);
  }

  @Get('callback')
  async callback(@Query('code') code: string, @Query('state') state: string, @Query('error') error: string, @Req() req: Request, @Res() res: Response) {
    const frontendUrl = this.configService.get<string>('app.frontendUrl') || 'http://localhost:5173';

    // Structural audit of the callback URL — the authorization `code` is single-use and MUST NOT be logged.
    const redactedUrl = (req.originalUrl || req.url || '').replace(/code=[^&]*/i, 'code=REDACTED');
    this.logger.debug(`OAuth callback URL: ${redactedUrl}`);
    this.logger.debug(`OAuth callback structure: code=${code ? 'present' : 'MISSING'} state=${state ? `present(${state.length} chars)` : 'MISSING'} error=${error || 'none'} frontendUrl=${frontendUrl}`);

    let onboardStateUid = '';
    let outletIdOrUid = '';
    let stateOutletId = '';

    if (state) {
      try {
        const decoded = JSON.parse(this.decrypt(state));
        outletIdOrUid = decoded.uid || decoded.outletId || '';
        stateOutletId = decoded.outletId || '';
        if (decoded.uid && !decoded.outletId) {
          onboardStateUid = decoded.uid;
        }
        this.logger.log(`Decoded OAuth state: uid=${decoded.uid || 'none'} outletId=${stateOutletId || 'none'}`);
      } catch {
        if (state.includes('"') || state.includes('%22')) {
          this.logger.warn(`Malformed OAuth state rejected: ${JSON.stringify(state)}`);
          return res.send(this.getPopupHtml('gmb-error', { error: 'OAuth state was malformed. Please reconnect your Google Business Profile.' }, frontendUrl));
        }
        outletIdOrUid = state;
      }
    }

    const db = this.firebaseService.getDb();

    if (error) {
      this.logger.error(`[Onboarding] Error: Google OAuth error - ${error}`);
      if (onboardStateUid) {
        await db.collection('onboarding_sessions').doc(onboardStateUid).set({
          status: 'error',
          error: `Google authorization failed: ${error}`,
          updatedAt: new Date(),
        }, { merge: true });
        this.logger.log(`[Onboarding] Session status updated: error for uid=${onboardStateUid}`);
      }
      return res.send(this.getPopupHtml('gmb-error', { error: `Google authorization failed: ${error}` }, frontendUrl));
    }

    if (!code) {
      this.logger.error('[Onboarding] Error: Missing authorization code');
      if (onboardStateUid) {
        await db.collection('onboarding_sessions').doc(onboardStateUid).set({
          status: 'error',
          error: 'Missing authorization code',
          updatedAt: new Date(),
        }, { merge: true });
        this.logger.log(`[Onboarding] Session status updated: error for uid=${onboardStateUid}`);
      }
      return res.send(this.getPopupHtml('gmb-error', { error: 'Missing authorization code' }, frontendUrl));
    }

    try {
      this.logger.log('[Onboarding] Google authentication verified');
      const { oauth2Client, tokens } = await this.googleBusinessService.exchangeCodeForTokens(code);

      const accountEmail = await this.googleBusinessService.fetchAccountEmail(oauth2Client);
      
      this.logger.log('[Onboarding] Fetching Google Business Profile');
      const { accountId, locations, fetchErrors } = await this.googleBusinessService.fetchAccountsAndLocations(oauth2Client);

      const noGmbFound = locations.length === 0 && fetchErrors.length === 0;
      const locationsWarning = locations.length === 0
        ? (fetchErrors.length
            ? `Google could not load your Business Profile locations: ${fetchErrors[0]}`
            : 'No, a Google My Business profile was not found with this Gmail account. Please use your Google My Business-linked Gmail account.')
        : '';

      if (!tokens.refresh_token) {
        this.logger.error('[Onboarding] Error: No refresh token received from Google');
        if (onboardStateUid) {
          await db.collection('onboarding_sessions').doc(onboardStateUid).set({
            status: 'error',
            error: 'No refresh token received. Please revoke access and try again.',
            updatedAt: new Date(),
          }, { merge: true });
          this.logger.log(`[Onboarding] Session status updated: error for uid=${onboardStateUid}`);
        }
        return res.send(this.getPopupHtml('gmb-error', { error: 'No refresh token received. Please revoke access and try again.' }, frontendUrl));
      }

      // ─── Onboarding flow ─────────────────────────────────────────────────
      if (onboardStateUid) {
        const encryptedRefreshToken = this.encrypt(tokens.refresh_token);
        const sessionStatus = locations.length > 0 ? 'ready' : (fetchErrors.length ? 'error' : 'no_gmb_found');
        const sessionPayload = {
          status: sessionStatus,
          googleRefreshToken: encryptedRefreshToken,
          googleAccountId: accountId,
          googleAccountEmail: accountEmail,
          googleLocations: locations,
          googleLocationsWarning: locationsWarning,
          googleLocationsFetchedAt: new Date(),
          googleTokenScope: tokens.scope || '',
          googleTokenExpiresAt: tokens.expiry_date || null,
          error: fetchErrors.length ? fetchErrors[0] : null,
          updatedAt: new Date(),
        };
        await db.collection('onboarding_sessions').doc(onboardStateUid).set(sessionPayload, { merge: true });
        this.logger.log('[Onboarding] GBP data saved');
        this.logger.log(`[Onboarding] Session status updated: ${sessionStatus} for uid=${onboardStateUid}`);
        return res.send(this.getPopupHtml('gmb-connected', {
          googleAccountEmail: accountEmail,
          googleLocations: locations,
          noGmbFound,
          googleLocationsWarning: locationsWarning,
        }, frontendUrl));
      }


      // ─── Existing-outlet connect flow ────────────────────────────────────
      if (outletIdOrUid) {
        this.logger.log(`OAuth callback: looking up user by uid=${outletIdOrUid}`);
        const userDoc = await db.collection('users').doc(outletIdOrUid).get();
        this.logger.log(`OAuth callback: user document ${userDoc.exists ? 'FOUND' : 'NOT FOUND'} for uid=${outletIdOrUid}`);

        if (userDoc.exists) {
          const userData = userDoc.data();
          const profileOutletId = userData?.outletId;
          const customerId = userData?.customerId;
          this.logger.log(`OAuth callback: user profile outletId=${profileOutletId || 'MISSING'} customerId=${customerId || 'MISSING'}`);

          // Determine which outletId to use: profile first, then state, then customer lookup
          let targetOutletId = profileOutletId;
          let outletSource = 'profile';

          if (!targetOutletId || typeof targetOutletId !== 'string' || targetOutletId.includes('"')) {
            if (stateOutletId && typeof stateOutletId === 'string' && !stateOutletId.includes('"')) {
              targetOutletId = stateOutletId;
              outletSource = 'state';
              this.logger.log(`OAuth callback: falling back to outletId from OAuth state: ${targetOutletId}`);
            } else if (customerId) {
              // Try to find an active outlet for this customer
              const outletsSnap = await db.collection('outlets')
                .where('customerId', '==', customerId)
                .where('status', '==', 'active')
                .limit(1)
                .get();
              if (!outletsSnap.empty) {
                targetOutletId = outletsSnap.docs[0].id;
                outletSource = 'customer-lookup';
                this.logger.log(`OAuth callback: found outlet ${targetOutletId} via customerId lookup`);
              }
            }
          }

          if (targetOutletId && typeof targetOutletId === 'string' && !targetOutletId.includes('"')) {
            // Verify the outlet document exists
            const outletDoc = await db.collection('outlets').doc(targetOutletId).get();
            this.logger.log(`OAuth callback: outlet document ${outletDoc.exists ? 'FOUND' : 'NOT FOUND'} for outletId=${targetOutletId} (source: ${outletSource})`);
            if (outletDoc.exists) {
              const outletData = outletDoc.data();
              this.logger.log(`OAuth callback: outlet customerId=${outletData?.customerId || 'MISSING'} user customerId=${customerId || 'MISSING'}`);
              if (customerId && outletData?.customerId && outletData.customerId !== customerId) {
                this.logger.error(`OAuth callback: outlet customerId mismatch - outlet belongs to customer ${outletData.customerId}, user belongs to ${customerId}`);
              }
            }

            const encryptedRefreshToken = this.encrypt(tokens.refresh_token);
            await db.collection('outlets').doc(targetOutletId).set({
              googleRefreshToken: encryptedRefreshToken,
              googleAccountId: accountId,
              googleAccountEmail: accountEmail,
              googleLocations: locations,
              googleConnectedAt: new Date(),
              googleConnectionStatus: 'connected',
              googleTokenInvalid: false,
              lastSyncError: null,
            }, { merge: true });
            this.logger.log(`Stored Google tokens for outlet: ${targetOutletId} (resolved via ${outletSource})`);
          } else {
            this.logger.error(`Refusing to store Google tokens: user ${outletIdOrUid} has no valid outletId (profile: ${JSON.stringify(profileOutletId)}, state: ${JSON.stringify(stateOutletId)}, customerId: ${customerId || 'none'})`);
            return res.send(this.getPopupHtml('gmb-error', { error: 'Your account is not linked to an outlet. Please contact support or re-complete onboarding.' }, frontendUrl));
          }
        } else {
          // Check if outletIdOrUid is directly an outlet document ID
          const directOutletDoc = await db.collection('outlets').doc(outletIdOrUid).get();
          if (directOutletDoc.exists) {
            const encryptedRefreshToken = this.encrypt(tokens.refresh_token);
            await db.collection('outlets').doc(outletIdOrUid).set({
              googleRefreshToken: encryptedRefreshToken,
              googleAccountId: accountId,
              googleAccountEmail: accountEmail,
              googleLocations: locations,
              googleConnectedAt: new Date(),
              googleConnectionStatus: 'connected',
              googleTokenInvalid: false,
              lastSyncError: null,
            }, { merge: true });
            this.logger.log(`Stored Google tokens directly for outlet: ${outletIdOrUid}`);
          } else {
            this.logger.log(`OAuth callback: user/outlet not found, storing in onboarding_sessions for ${outletIdOrUid}`);
            const encryptedRefreshToken = this.encrypt(tokens.refresh_token);
            await db.collection('onboarding_sessions').doc(outletIdOrUid).set({
              googleRefreshToken: encryptedRefreshToken,
              googleAccountId: accountId,
              googleAccountEmail: accountEmail,
              googleLocations: locations,
              createdAt: new Date(),
            }, { merge: true });
            this.logger.log(`Stored Google tokens in onboarding session: ${outletIdOrUid}`);
          }
        }
      }

      return res.send(this.getPopupHtml('gmb-connected', {
        googleAccountEmail: accountEmail,
        googleLocations: locations,
        googleLocationsWarning: locationsWarning,
      }, frontendUrl));

    } catch (err: any) {
      this.logger.error(`[Onboarding] Error: Google OAuth callback failed - ${err.message}`);
      if (onboardStateUid) {
        try {
          await db.collection('onboarding_sessions').doc(onboardStateUid).set({
            status: 'error',
            error: err.message,
            updatedAt: new Date(),
          }, { merge: true });
          this.logger.log(`[Onboarding] Session status updated: error for uid=${onboardStateUid}`);
        } catch (_) {}
      }
      return res.send(this.getPopupHtml('gmb-error', { error: err.message }, frontendUrl));
    }
  }

  @Get('status')
  async status(@Query('outletId') outletId: string) {
    if (!outletId) {
      throw new HttpException('Missing outletId parameter', HttpStatus.BAD_REQUEST);
    }

    const db = this.firebaseService.getDb();
    const outletDoc = await db.collection('outlets').doc(outletId).get();

    if (!outletDoc.exists) {
      return { connected: false };
    }

    const data = outletDoc.data();
    const isTokenInvalid = data?.googleTokenInvalid === true || data?.googleConnectionStatus === 'invalid_grant';
    const isConnected = !!data?.googleRefreshToken && !isTokenInvalid;

    return {
      connected: isConnected,
      needsReconnection: isTokenInvalid || (!data?.googleRefreshToken && !!data?.googleAccountId),
      error: isTokenInvalid ? 'invalid_grant' : (data?.lastSyncError || null),
      accountEmail: data?.googleAccountEmail || null,
      activeLocation: data?.googleActiveLocation || null,
      locations: data?.googleLocations || [],
    };
  }

  @Post('disconnect')
  async disconnect(@Body() body: { outletId: string }) {
    const { outletId } = body || {};
    const safeOutletId = this.sanitizeId(outletId, 'outletId');

    const db = this.firebaseService.getDb();
    await db.collection('outlets').doc(safeOutletId).set({
      googleRefreshToken: null,
      googleAccountId: null,
      googleAccountEmail: null,
      googleLocations: [],
      googleActiveLocation: null,
      googleLocationId: null,
      googleConnectionStatus: 'disconnected',
      googleTokenInvalid: false,
      lastSyncError: null,
      googleDisconnectedAt: new Date(),
    }, { merge: true });

    return { success: true, message: 'Google account disconnected successfully.' };
  }

  @Post('active-location')
  async setActiveLocation(@Body() body: { outletId: string; locationId: string }) {
    const { outletId, locationId } = body || {};
    const safeOutletId = this.sanitizeId(outletId, 'outletId');
    const safeLocationId = this.sanitizeId(locationId, 'locationId');

    const db = this.firebaseService.getDb();
    await db.collection('outlets').doc(safeOutletId).set({
      googleActiveLocation: safeLocationId,
      googleLocationId: safeLocationId,
    }, { merge: true });

    return { success: true };
  }

  private getPopupHtml(type: string, data: Record<string, any>, frontendUrl: string): string {
    // Escape values before embedding them in the inline script so a malformed
    // URL / error message cannot break out of the script block.
    const esc = (value: unknown): string =>
      String(value ?? '')
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/&/g, '\\u0026');
    const safeType = esc(type);
    const safeData = JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e');
    const safeError = esc(data?.error);
    const safeFrontendUrl = esc(frontendUrl);

    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Google Connection</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f8fafc; }
    .container { text-align: center; padding: 2rem; background: white; border-radius: 1rem; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); max-width: 400px; }
    .icon { width: 48px; height: 48px; margin: 0 auto 1rem; }
    .success { color: #10b981; }
    .error { color: #ef4444; }
    h1 { font-size: 1.25rem; font-weight: 600; margin-bottom: 0.5rem; }
    p { font-size: 0.875rem; color: #64748b; word-break: break-word; }
  </style>
</head>
<body>
  <div class="container">
    ${type === 'gmb-connected' ? `
      <svg class="icon success" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
      <h1>Connected Successfully</h1>
      <p>Google Business Profile connected. You can close this window.</p>
    ` : `
      <svg class="icon error" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
      <h1>Connection Failed</h1>
      <p>${safeError}</p>
    `}
  </div>
  <script>
    (function() {
      const message = { type: '${safeType}', ...${safeData} };
      if (window.opener) {
        window.opener.postMessage(message, '${safeFrontendUrl}');
        setTimeout(function() { window.close(); }, 2000);
      } else {
        setTimeout(function() { window.location.href = '${safeFrontendUrl}/connect-google'; }, 2000);
      }
    })();
  </script>
</body>
</html>
    `;
  }
}