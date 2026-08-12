import { Controller, Post, Body, Req, Res, HttpStatus, Logger } from '@nestjs/common';
import { Request, Response } from 'express';
import { FirebaseService } from '../firebase/firebase.service';

@Controller('whatsapp')
export class WhatsAppWebhookController {
  private readonly logger = new Logger(WhatsAppWebhookController.name);

  constructor(private readonly firebaseService: FirebaseService) {}

  /**
   * POST /api/whatsapp/twilio/callback
   * Twilio StatusCallback webhook handler.
   */
  @Post('twilio/callback')
  async handleTwilioCallback(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    const payload = body || req.body || {};
    const messageSid = payload.MessageSid || payload.SmsSid;
    const messageStatus = payload.MessageStatus || payload.SmsStatus;
    const errorCode = payload.ErrorCode;
    const errorMessage = payload.ErrorMessage;
    const to = payload.To;

    this.logger.log(`[WhatsApp Webhook] Twilio status callback received: sid=${messageSid}, status=${messageStatus}, to=${to}`);

    if (messageSid) {
      try {
        const db = this.firebaseService.getDb();
        const logsSnap = await db.collection('notificationLogs')
          .where('messageId', '==', messageSid)
          .get();

        if (!logsSnap.empty) {
          for (const doc of logsSnap.docs) {
            await doc.ref.update({
              deliveryStatus: messageStatus,
              updatedAt: new Date(),
              ...(errorCode ? { errorCode: String(errorCode) } : {}),
              ...(errorMessage ? { errorMessage: String(errorMessage) } : {}),
            });
          }
          this.logger.log(`[WhatsApp Webhook] Updated ${logsSnap.size} log records for MessageSid ${messageSid}`);
        }
      } catch (err: any) {
        this.logger.error(`[WhatsApp Webhook] Error updating status for MessageSid ${messageSid}: ${err.message}`);
      }
    }

    // Twilio requires a 200 OK TwiML or empty response
    return res.status(HttpStatus.OK).send('<Response></Response>');
  }

  /**
   * POST /api/whatsapp/feedback
   * Capture structured feedback from trial expired feedback response.
   * Suggested values: pricing, need_more_time, missing_feature, internal_approval, not_priority
   */
  @Post('feedback')
  async captureFeedback(@Body() body: { customerId?: string; outletId?: string; feedbackKey: string; comments?: string }, @Res() res: Response) {
    const { customerId, outletId, feedbackKey, comments } = body;

    const validKeys = ['pricing', 'need_more_time', 'missing_feature', 'internal_approval', 'not_priority'];
    const normalizedKey = (feedbackKey || '').toLowerCase().trim().replace(/\s+/g, '_');

    if (!validKeys.includes(normalizedKey)) {
      return res.status(HttpStatus.BAD_REQUEST).json({
        error: `Invalid feedback key '${feedbackKey}'. Expected one of: ${validKeys.join(', ')}`,
      });
    }

    try {
      const db = this.firebaseService.getDb();

      const feedbackData = {
        feedbackKey: normalizedKey,
        comments: comments || null,
        receivedAt: new Date(),
        source: 'whatsapp_response',
      };

      if (customerId) {
        await db.collection('customers').doc(customerId).set({ trialFeedback: feedbackData }, { merge: true });
      }

      if (outletId) {
        await db.collection('outlets').doc(outletId).set({ trialFeedback: feedbackData }, { merge: true });
      }

      await db.collection('trialFeedbackLogs').add({
        customerId: customerId || null,
        outletId: outletId || null,
        ...feedbackData,
      });

      this.logger.log(`[WhatsApp Feedback] Structured trial feedback saved: key=${normalizedKey}, customerId=${customerId || 'N/A'}`);

      return res.status(HttpStatus.OK).json({ success: true, feedback: feedbackData });
    } catch (err: any) {
      this.logger.error(`[WhatsApp Feedback] Failed to capture feedback: ${err.message}`);
      return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({ error: 'Failed to record feedback' });
    }
  }

  /**
   * POST /api/whatsapp/webhook
   * Generic WhatsApp incoming message & button reply webhook endpoint
   */
  @Post('webhook')
  async handleGenericWebhook(@Body() body: any, @Res() res: Response) {
    this.logger.log('[WhatsApp Webhook] Incoming message webhook received', body);

    // If incoming message contains trial feedback selection
    const incomingText = (body?.Body || body?.button_reply?.id || body?.text || '').toLowerCase();
    const fromPhone = body?.From || body?.from;

    const feedbackMap: Record<string, string> = {
      pricing: 'pricing',
      '[ pricing ]': 'pricing',
      'need more time': 'need_more_time',
      '[ need more time ]': 'need_more_time',
      'missing a feature': 'missing_feature',
      '[ missing a feature ]': 'missing_feature',
      'need internal approval': 'internal_approval',
      '[ need internal approval ]': 'internal_approval',
      'not a priority now': 'not_priority',
      '[ not a priority now ]': 'not_priority',
    };

    const matchedKey = Object.keys(feedbackMap).find(k => incomingText.includes(k));
    if (matchedKey && fromPhone) {
      try {
        const feedbackValue = feedbackMap[matchedKey];
        const db = this.firebaseService.getDb();
        const cleanPhone = fromPhone.replace('whatsapp:', '').trim();

        const outletsSnap = await db.collection('outlets')
          .where('whatsappNumber', '==', cleanPhone)
          .limit(1)
          .get();

        if (!outletsSnap.empty) {
          const outletDoc = outletsSnap.docs[0];
          const outletData = outletDoc.data();
          await this.captureFeedback({
            customerId: outletData.customerId,
            outletId: outletDoc.id,
            feedbackKey: feedbackValue,
          }, res);
          return;
        }
      } catch (err: any) {
        this.logger.error(`[WhatsApp Webhook] Feedback auto-capture error: ${err.message}`);
      }
    }

    return res.status(HttpStatus.OK).json({ status: 'received' });
  }
}
