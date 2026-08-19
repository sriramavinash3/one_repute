/**
 * tests/account.deletion.spec.ts
 * 
 * Production test suite for Secure Customer Account Deletion & OTP Verification.
 */

import { BadRequestException, HttpException } from '@nestjs/common';
import { AccountService } from '../src/modules/account/account.service';
import { AuthUser } from '../src/modules/auth/interfaces/auth-user.interface';

describe('AccountService — Account Deletion & OTP Flow', () => {
  let accountService: AccountService;
  let mockCacheService: any;
  let mockEmailService: any;
  let mockFirebaseService: any;
  let mockPrismaService: any;

  // In-memory mock storage for CacheService
  const cacheMap = new Map<string, { value: any; expiresAt: number }>();

  // Mock Firestore implementation
  const firestoreCollections = new Map<string, Map<string, any>>();

  const getCollection = (colName: string) => {
    if (!firestoreCollections.has(colName)) {
      firestoreCollections.set(colName, new Map());
    }
    return firestoreCollections.get(colName)!;
  };

  const mockFirestoreDb = {
    collection: (colName: string) => ({
      doc: (docId: string) => ({
        get: jest.fn(async () => {
          const col = getCollection(colName);
          const data = col.get(docId);
          return {
            exists: Boolean(data),
            id: docId,
            data: () => data,
          };
        }),
        set: jest.fn(async (data: any, options?: any) => {
          const col = getCollection(colName);
          const existing = col.get(docId) || {};
          const updated = options?.merge ? { ...existing, ...data } : data;
          col.set(docId, updated);
        }),
        delete: jest.fn(async () => {
          const col = getCollection(colName);
          col.delete(docId);
        }),
      }),
      where: (field: string, op: string, val: any) => ({
        limit: (l: number) => ({
          get: jest.fn(async () => {
            const col = getCollection(colName);
            const matches: any[] = [];
            col.forEach((data, id) => {
              if (data[field] === val && matches.length < l) {
                matches.push({ id, data: () => data, ref: { delete: jest.fn() } });
              }
            });
            return {
              empty: matches.length === 0,
              docs: matches,
            };
          }),
        }),
        get: jest.fn(async () => {
          const col = getCollection(colName);
          const matches: any[] = [];
          col.forEach((data, id) => {
            if (data[field] === val) {
              matches.push({ id, data: () => data, ref: { delete: jest.fn() } });
            }
          });
          return {
            empty: matches.length === 0,
            docs: matches,
          };
        }),
      }),
      add: jest.fn(async (data: any) => {
        const col = getCollection(colName);
        const id = `doc_${Date.now()}_${Math.random()}`;
        col.set(id, data);
        return { id };
      }),
    }),
    batch: () => {
      const ops: Array<() => Promise<void>> = [];
      return {
        set: (ref: any, data: any, options?: any) => {
          ops.push(async () => {
            await ref.set(data, options);
          });
        },
        delete: (ref: any) => {
          ops.push(async () => {
            await ref.delete();
          });
        },
        commit: async () => {
          for (const op of ops) await op();
        },
      };
    },
  };

  const mockAuthUserA: AuthUser = {
    uid: 'uid_cust_a',
    email: 'customer_a@example.com',
    role: 'outlet',
    customerId: 'cust_a',
    assignedOutletIds: ['outlet_a1'],
  };

  const mockAuthUserB: AuthUser = {
    uid: 'uid_cust_b',
    email: 'customer_b@example.com',
    role: 'outlet',
    customerId: 'cust_b',
    assignedOutletIds: ['outlet_b1'],
  };

  beforeEach(() => {
    cacheMap.clear();
    firestoreCollections.clear();
    jest.clearAllMocks();

    mockCacheService = {
      get: jest.fn(async (key: string) => {
        const entry = cacheMap.get(key);
        if (!entry) return null;
        if (Date.now() > entry.expiresAt) {
          cacheMap.delete(key);
          return null;
        }
        return entry.value;
      }),
      set: jest.fn(async (key: string, value: any, ttlSeconds = 600) => {
        cacheMap.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
      }),
      del: jest.fn(async (key: string) => {
        cacheMap.delete(key);
      }),
      reset: jest.fn(async () => {
        cacheMap.clear();
      }),
      isHealthy: jest.fn(async () => true),
      providerName: 'mock-cache',
    };

    mockEmailService = {
      sendAccountDeletionOtp: jest.fn(async () => ({
        success: true,
        jobId: 'job_123',
        queuedAt: new Date().toISOString(),
        recipient: 'customer_a@example.com',
      })),
    };

    mockFirebaseService = {
      getDb: () => mockFirestoreDb,
      invalidateUserProfile: jest.fn(),
    };

    mockPrismaService = {
      review: { deleteMany: jest.fn(async () => ({ count: 0 })) },
      syncHistory: { deleteMany: jest.fn(async () => ({ count: 0 })) },
      analyticsSnapshot: { deleteMany: jest.fn(async () => ({ count: 0 })) },
      location: { delete: jest.fn(async () => ({})) },
      subscription: { deleteMany: jest.fn(async () => ({ count: 0 })) },
      user: { delete: jest.fn(async () => ({})) },
    };

    // Populate initial customer A and B records in mock Firestore
    const usersCol = getCollection('users');
    usersCol.set('uid_cust_a', { email: 'customer_a@example.com', role: 'outlet', customerId: 'cust_a' });
    usersCol.set('uid_cust_b', { email: 'customer_b@example.com', role: 'outlet', customerId: 'cust_b' });

    const custCol = getCollection('customers');
    custCol.set('cust_a', { email: 'customer_a@example.com', name: 'Customer A Inc' });
    custCol.set('cust_b', { email: 'customer_b@example.com', name: 'Customer B Corp' });

    const outletsCol = getCollection('outlets');
    outletsCol.set('outlet_a1', { customerId: 'cust_a', ownerId: 'uid_cust_a', name: 'Outlet A1', googleRefreshToken: 'token_a' });
    outletsCol.set('outlet_b1', { customerId: 'cust_b', ownerId: 'uid_cust_b', name: 'Outlet B1', googleRefreshToken: 'token_b' });

    accountService = new AccountService(
      mockFirebaseService,
      mockPrismaService,
      mockCacheService,
      mockEmailService,
    );
  });

  describe('Step 1: Request Deletion OTP', () => {
    it('should generate 6-digit OTP, store challenge in cache, set 60s cooldown, and dispatch email', async () => {
      const res = await accountService.requestDeletionOtp(mockAuthUserA);

      expect(res.success).toBe(true);
      expect(res.message).toBe('Verification code sent.');

      expect(mockEmailService.sendAccountDeletionOtp).toHaveBeenCalledWith(
        expect.objectContaining({
          recipientEmail: 'customer_a@example.com',
          userId: 'uid_cust_a',
          expiresInMinutes: 10,
        }),
      );

      // Verify OTP is a 6-digit number string passed to email
      const calls = mockEmailService.sendAccountDeletionOtp.mock.calls;
      expect(calls.length).toBe(1);
      const sentDto = calls[0][0];
      expect(sentDto.otpCode).toMatch(/^\d{6}$/);

      // Check challenge stored in cache
      const challengeKey = `otp_challenge:account_delete:uid_cust_a`;
      const storedChallenge = cacheMap.get(challengeKey)?.value;
      expect(storedChallenge).toBeDefined();
      expect(storedChallenge.email).toBe('customer_a@example.com');
      expect(storedChallenge.purpose).toBe('ACCOUNT_DELETION');

      // Check cooldown key stored
      const cooldownKey = `otp_cooldown:account_delete:uid_cust_a`;
      expect(cacheMap.get(cooldownKey)).toBeDefined();
    });

    it('should enforce 60-second cooldown rate limit on consecutive requests', async () => {
      await accountService.requestDeletionOtp(mockAuthUserA);

      // Immediate second request should throw 429
      await expect(accountService.requestDeletionOtp(mockAuthUserA)).rejects.toThrow(
        HttpException,
      );
    });
  });

  describe('Step 2: Verify OTP & Server-Side Deletion', () => {
    it('should reject invalid or missing OTP code', async () => {
      await accountService.requestDeletionOtp(mockAuthUserA);

      await expect(accountService.verifyDeletionOtp(mockAuthUserA, '999999')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should lock verification and throw 429 after 5 failed attempts', async () => {
      await accountService.requestDeletionOtp(mockAuthUserA);

      // 4 failed attempts
      for (let i = 0; i < 4; i++) {
        await expect(accountService.verifyDeletionOtp(mockAuthUserA, '000000')).rejects.toThrow(
          BadRequestException,
        );
      }

      // 5th failed attempt should throw 429 Too Many Requests
      await expect(accountService.verifyDeletionOtp(mockAuthUserA, '000000')).rejects.toThrow(
        HttpException,
      );
    });

    it('should execute server-side deletion transaction on correct OTP and leave Customer B intact', async () => {
      // Mock Firebase Admin Auth methods
      const adminAuthModule = require('firebase-admin');
      jest.spyOn(adminAuthModule, 'auth').mockReturnValue({
        revokeRefreshTokens: jest.fn(async () => {}),
        deleteUser: jest.fn(async () => {}),
      } as any);

      await accountService.requestDeletionOtp(mockAuthUserA);
      const calls = mockEmailService.sendAccountDeletionOtp.mock.calls;
      const sentOtp = calls[0][0].otpCode;

      const result = await accountService.verifyDeletionOtp(mockAuthUserA, sentOtp);

      expect(result.success).toBe(true);
      expect(result.message).toBe('Your account has been permanently deleted.');

      // Verify Customer A documents are deleted/marked removed in Firestore
      const custA = getCollection('customers').get('cust_a');
      expect(custA).toBeUndefined(); // Customer document deleted

      const userA = getCollection('users').get('uid_cust_a');
      expect(userA.accountStatus).toBe('DELETED');
      expect(userA.isDeleted).toBe(true);

      const outletA1 = getCollection('outlets').get('outlet_a1');
      expect(outletA1.status).toBe('removed');
      expect(outletA1.isDeleted).toBe(true);
      expect(outletA1.googleRefreshToken).toBeNull(); // OAuth token revoked/cleared

      // CRITICAL DATA ISOLATION TEST: Customer B data MUST REMAIN ENTIRELY UNTOUCHED!
      const userB = getCollection('users').get('uid_cust_b');
      expect(userB).toBeDefined();
      expect(userB.email).toBe('customer_b@example.com');

      const custB = getCollection('customers').get('cust_b');
      expect(custB).toBeDefined();
      expect(custB.name).toBe('Customer B Corp');

      const outletB1 = getCollection('outlets').get('outlet_b1');
      expect(outletB1).toBeDefined();
      expect(outletB1.status).not.toBe('removed');
      expect(outletB1.googleRefreshToken).toBe('token_b');
    });
  });
});
