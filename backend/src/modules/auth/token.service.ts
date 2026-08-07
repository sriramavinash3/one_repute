/**
 * src/modules/auth/token.service.ts
 * 
 * Secure Cryptographic Token Generator & SHA-256 Hasher.
 * Handles Verification and Password Reset Token Security.
 */

import { Injectable } from '@nestjs/common';
import * as crypto from 'crypto';

export interface GeneratedTokenInfo {
  rawToken: string;
  tokenHash: string;
  expiresAt: Date;
}

export interface StoredTokenRecord {
  id: string;
  identifier: string; // User email or ID
  tokenHash: string;
  expiresAt: Date;
  usedAt?: Date | null;
}

@Injectable()
export class TokenService {
  // In-memory token store fallback (for environments without active DB)
  private readonly tokenStore = new Map<string, StoredTokenRecord>();

  /**
   * Generate secure random 32-byte hexadecimal token and SHA-256 hash
   */
  generateSecureToken(ttlMinutes: number): GeneratedTokenInfo {
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = new Date(Date.now() + ttlMinutes * 60 * 1000);

    return {
      rawToken,
      tokenHash,
      expiresAt,
    };
  }

  /**
   * Hash a raw token string using SHA-256
   */
  hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
  }

  /**
   * Store token record securely (hash only)
   */
  async storeToken(identifier: string, tokenInfo: GeneratedTokenInfo): Promise<StoredTokenRecord> {
    const record: StoredTokenRecord = {
      id: `tok_${Math.random().toString(36).substring(2, 11)}`,
      identifier,
      tokenHash: tokenInfo.tokenHash,
      expiresAt: tokenInfo.expiresAt,
      usedAt: null,
    };

    this.tokenStore.set(tokenInfo.tokenHash, record);
    return record;
  }

  /**
   * Validate raw token against stored SHA-256 hash. Enforces expiration and single-use invalidation.
   */
  async validateToken(identifier: string, rawToken: string): Promise<{ valid: boolean; reason?: string }> {
    const tokenHash = this.hashToken(rawToken);
    const record = this.tokenStore.get(tokenHash);

    if (!record) {
      return { valid: false, reason: 'Token not found or invalid' };
    }

    if (record.identifier !== identifier) {
      return { valid: false, reason: 'Token identifier mismatch' };
    }

    if (record.usedAt) {
      return { valid: false, reason: 'Token has already been used (single-use constraint)' };
    }

    if (new Date() > record.expiresAt) {
      this.tokenStore.delete(tokenHash);
      return { valid: false, reason: 'Token has expired' };
    }

    return { valid: true };
  }

  /**
   * Invalidate token after successful verification/password reset
   */
  async invalidateToken(rawToken: string): Promise<void> {
    const tokenHash = this.hashToken(rawToken);
    const record = this.tokenStore.get(tokenHash);
    if (record) {
      record.usedAt = new Date();
      // Remove token to prevent any future replay attempts
      this.tokenStore.delete(tokenHash);
    }
  }

  /**
   * Clean up expired tokens from memory store
   */
  async cleanupExpiredTokens(): Promise<number> {
    let count = 0;
    const now = new Date();
    for (const [hash, record] of this.tokenStore.entries()) {
      if (now > record.expiresAt || record.usedAt) {
        this.tokenStore.delete(hash);
        count++;
      }
    }
    return count;
  }
}
