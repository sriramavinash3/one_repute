/**
 * tests/token.service.spec.ts
 * 
 * Unit tests for Cryptographic Token Hashing, TTL Expiration, and Single-Use Invalidation.
 */

import { TokenService } from '../src/modules/auth/token.service';

describe('TokenService', () => {
  let tokenService: TokenService;

  beforeEach(() => {
    tokenService = new TokenService();
  });

  it('should generate secure raw token, SHA-256 hash, and valid expiration date', () => {
    const tokenInfo = tokenService.generateSecureToken(15);

    expect(tokenInfo.rawToken).toBeDefined();
    expect(tokenInfo.rawToken.length).toBe(64); // 32 bytes hex = 64 chars
    expect(tokenInfo.tokenHash).toBeDefined();
    expect(tokenInfo.tokenHash).not.toEqual(tokenInfo.rawToken);
    expect(tokenInfo.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('should store and validate a valid token', async () => {
    const identifier = 'user@onerepute.com';
    const tokenInfo = tokenService.generateSecureToken(15);
    await tokenService.storeToken(identifier, tokenInfo);

    const validation = await tokenService.validateToken(identifier, tokenInfo.rawToken);
    expect(validation.valid).toBe(true);
  });

  it('should reject invalid raw tokens', async () => {
    const identifier = 'user@onerepute.com';
    const tokenInfo = tokenService.generateSecureToken(15);
    await tokenService.storeToken(identifier, tokenInfo);

    const validation = await tokenService.validateToken(identifier, 'wrong_raw_token');
    expect(validation.valid).toBe(false);
    expect(validation.reason).toContain('not found');
  });

  it('should enforce single-use constraint after token invalidation', async () => {
    const identifier = 'user@onerepute.com';
    const tokenInfo = tokenService.generateSecureToken(15);
    await tokenService.storeToken(identifier, tokenInfo);

    await tokenService.invalidateToken(tokenInfo.rawToken);

    const validation = await tokenService.validateToken(identifier, tokenInfo.rawToken);
    expect(validation.valid).toBe(false);
  });

  it('should reject expired tokens', async () => {
    const identifier = 'user@onerepute.com';
    // Generate token with negative TTL (expired 5 minutes ago)
    const tokenInfo = tokenService.generateSecureToken(-5);
    await tokenService.storeToken(identifier, tokenInfo);

    const validation = await tokenService.validateToken(identifier, tokenInfo.rawToken);
    expect(validation.valid).toBe(false);
    expect(validation.reason).toContain('expired');
  });
});
