import { ConfigService } from '@nestjs/config';
import { HttpStatus } from '@nestjs/common';
import * as twilio from 'twilio';
import { WhatsAppWebhookController, categorizeTwilioError } from '../src/modules/whatsapp/whatsapp-webhook.controller';
import { TwilioSignatureGuard } from '../src/modules/whatsapp/guards/twilio-signature.guard';
import { FirebaseAuthMiddleware } from '../src/modules/auth/guards/express-auth.middleware';

describe('Twilio WhatsApp StatusCallback Integration', () => {
  const TEST_AUTH_TOKEN = '1234567890abcdef1234567890abcdef';
  const TARGET_URL = 'https://api.onerepute.com/api/whatsapp/twilio/callback';

  let controller: WhatsAppWebhookController;
  let guard: TwilioSignatureGuard;
  let mockFirebaseService: any;
  let mockConfigService: any;
  let mockDocs: Map<string, any>;

  beforeEach(async () => {
    process.env.NODE_ENV = 'test';
    process.env.TWILIO_AUTH_TOKEN = TEST_AUTH_TOKEN;

    mockDocs = new Map();

    mockFirebaseService = {
      getDb: jest.fn().mockReturnValue({
        collection: jest.fn().mockReturnValue({
          where: jest.fn().mockImplementation((field, op, val) => ({
            get: jest.fn().mockImplementation(async () => {
              const matches: any[] = [];
              mockDocs.forEach((docData, docId) => {
                if (docData[field] === val) {
                  matches.push({
                    id: docId,
                    data: () => docData,
                    ref: {
                      update: jest.fn().mockImplementation(async (updateObj) => {
                        Object.assign(docData, updateObj);
                      }),
                    },
                  });
                }
              });
              return {
                empty: matches.length === 0,
                size: matches.length,
                docs: matches,
              };
            }),
          })),
          add: jest.fn().mockImplementation(async (data) => {
            const id = `doc_${Date.now()}_${Math.random()}`;
            mockDocs.set(id, { ...data });
            return { id };
          }),
        }),
      }),
      verifyIdToken: jest.fn().mockRejectedValue(new Error('Invalid token')),
      getCachedAuthUser: jest.fn().mockReturnValue(null),
      getCachedUserProfile: jest.fn().mockReturnValue(null),
    };

    mockConfigService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'TWILIO_AUTH_TOKEN') return TEST_AUTH_TOKEN;
        if (key === 'TWILIO_STATUS_CALLBACK_URL') return TARGET_URL;
        return undefined;
      }),
    };

    guard = new TwilioSignatureGuard(mockConfigService);
    controller = new WhatsAppWebhookController(mockFirebaseService);
  });

  describe('Error Classification (categorizeTwilioError)', () => {
    it('should classify error 63015 as RECIPIENT_SANDBOX_UNENROLLED', () => {
      const category = categorizeTwilioError('63015', 'Channel Sandbox can only send messages to phone numbers that have joined the Sandbox');
      expect(category).toBe('RECIPIENT_SANDBOX_UNENROLLED');
    });

    it('should classify sandbox message without code as RECIPIENT_SANDBOX_UNENROLLED', () => {
      const category = categorizeTwilioError(undefined, 'User has not joined the sandbox');
      expect(category).toBe('RECIPIENT_SANDBOX_UNENROLLED');
    });

    it('should classify invalid recipient errors as RECIPIENT_RESTRICTION', () => {
      const category = categorizeTwilioError('63001', 'To phone number is not a valid WhatsApp number');
      expect(category).toBe('RECIPIENT_RESTRICTION');
    });

    it('should classify network failures as PROVIDER_NETWORK_FAILURE', () => {
      const category = categorizeTwilioError('50001', 'Provider network timeout');
      expect(category).toBe('PROVIDER_NETWORK_FAILURE');
    });
  });

  describe('TwilioSignatureGuard', () => {
    it('should allow request with valid X-Twilio-Signature', () => {
      const body = {
        MessageSid: 'SM12345',
        MessageStatus: 'delivered',
      };
      const signature = twilio.getExpectedTwilioSignature(TEST_AUTH_TOKEN, TARGET_URL, body);

      const mockContext: any = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              'x-twilio-signature': signature,
              'x-forwarded-proto': 'https',
              'x-forwarded-host': 'api.onerepute.com',
            },
            originalUrl: '/api/whatsapp/twilio/callback',
            protocol: 'https',
            body,
          }),
        }),
      };

      expect(guard.canActivate(mockContext)).toBe(true);
    });

    it('should reject request missing X-Twilio-Signature header with 401', () => {
      const mockContext: any = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {},
            originalUrl: '/api/whatsapp/twilio/callback',
            body: {},
          }),
        }),
      };

      expect(() => guard.canActivate(mockContext)).toThrow('Unauthorized: Missing Twilio signature');
    });

    it('should reject request with invalid X-Twilio-Signature with 401', () => {
      const mockContext: any = {
        switchToHttp: () => ({
          getRequest: () => ({
            headers: {
              'x-twilio-signature': 'invalid_signature_string',
              'x-forwarded-proto': 'https',
              'x-forwarded-host': 'api.onerepute.com',
            },
            originalUrl: '/api/whatsapp/twilio/callback',
            protocol: 'https',
            body: { MessageSid: 'SM123' },
          }),
        }),
      };

      expect(() => guard.canActivate(mockContext)).toThrow('Unauthorized: Invalid Twilio signature');
    });
  });

  describe('handleTwilioCallback Controller', () => {
    it('should process MessageStatus=sent successfully', async () => {
      const payload = {
        MessageSid: 'SM_SENT_01',
        MessageStatus: 'sent',
        To: 'whatsapp:+919876543210',
        From: 'whatsapp:+14155238886',
        AccountSid: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      };

      const mockRes: any = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis(),
      };

      await controller.handleTwilioCallback(payload, {} as any, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(mockRes.send).toHaveBeenCalledWith('<Response></Response>');

      let foundDoc: any = null;
      mockDocs.forEach((d) => {
        if (d.messageId === 'SM_SENT_01') foundDoc = d;
      });
      expect(foundDoc).not.toBeNull();
      expect(foundDoc.deliveryStatus).toBe('sent');
      expect(foundDoc.success).toBe(true);
    });

    it('should process MessageStatus=delivered and update existing record', async () => {
      // Pre-seed notificationLog
      mockDocs.set('existing_log_1', {
        messageId: 'SM_DELIVERED_01',
        deliveryStatus: 'sent',
        success: true,
      });

      const payload = {
        MessageSid: 'SM_DELIVERED_01',
        MessageStatus: 'delivered',
        To: 'whatsapp:+919876543210',
      };

      const mockRes: any = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis(),
      };

      await controller.handleTwilioCallback(payload, {} as any, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.OK);
      const updatedDoc = mockDocs.get('existing_log_1');
      expect(updatedDoc.deliveryStatus).toBe('delivered');
    });

    it('should process MessageStatus=failed with ErrorCode=63015 and return 200 OK', async () => {
      const payload = {
        MessageSid: 'SM2d018cefaea2a80cbe5d3f7fc50ede63',
        MessageStatus: 'failed',
        SmsStatus: 'failed',
        ErrorCode: '63015',
        ErrorMessage: 'Channel Sandbox can only send messages to phone numbers that have joined the Sandbox',
        To: 'whatsapp:+919876543210',
        From: 'whatsapp:+14155238886',
        AccountSid: 'ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
        ChannelPrefix: 'whatsapp',
      };

      const mockRes: any = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis(),
      };

      await controller.handleTwilioCallback(payload, {} as any, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.OK);
      expect(mockRes.send).toHaveBeenCalledWith('<Response></Response>');

      let foundDoc: any = null;
      mockDocs.forEach((d) => {
        if (d.messageId === 'SM2d018cefaea2a80cbe5d3f7fc50ede63') foundDoc = d;
      });

      expect(foundDoc).not.toBeNull();
      expect(foundDoc.deliveryStatus).toBe('failed');
      expect(foundDoc.errorCode).toBe('63015');
      expect(foundDoc.errorCategory).toBe('RECIPIENT_SANDBOX_UNENROLLED');
      expect(foundDoc.success).toBe(false);
    });

    it('should maintain idempotency and not downgrade higher precedence statuses', async () => {
      // Pre-seed doc already in 'read' status
      mockDocs.set('existing_log_read', {
        messageId: 'SM_READ_01',
        deliveryStatus: 'read',
        success: true,
      });

      // Out of order callback arriving later
      const payload = {
        MessageSid: 'SM_READ_01',
        MessageStatus: 'sent',
      };

      const mockRes: any = {
        status: jest.fn().mockReturnThis(),
        send: jest.fn().mockReturnThis(),
      };

      await controller.handleTwilioCallback(payload, {} as any, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.OK);
      const updatedDoc = mockDocs.get('existing_log_read');
      // Delivery status should remain 'read'
      expect(updatedDoc.deliveryStatus).toBe('read');
      // History should have logged both
      expect(updatedDoc.callbackHistory.length).toBe(1);
    });
  });

  describe('FirebaseAuthMiddleware Public Path Bypass', () => {
    it('should bypass auth check for /api/whatsapp/twilio/callback without Bearer token', async () => {
      const middleware = new FirebaseAuthMiddleware(mockFirebaseService);

      const req: any = {
        originalUrl: '/api/whatsapp/twilio/callback',
        headers: {},
      };
      const res: any = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };
      const next = jest.fn();

      await middleware.use(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalledWith(401);
    });

    it('should still enforce 401 for non-public protected routes without Bearer token', async () => {
      const middleware = new FirebaseAuthMiddleware(mockFirebaseService);

      const req: any = {
        originalUrl: '/api/dashboard/stats',
        headers: {},
      };
      const res: any = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
      };
      const next = jest.fn();

      await middleware.use(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: 'Unauthorized: Missing or invalid token' });
      expect(next).not.toHaveBeenCalled();
    });
  });
});
