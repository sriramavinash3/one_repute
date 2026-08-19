import { Controller, Post, Body, Req, Res, HttpStatus, Logger, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { FirebaseService } from '../firebase/firebase.service';
import { TwilioSignatureGuard } from './guards/twilio-signature.guard';

export function categorizeTwilioError(errorCode?: string | number, errorMessage?: string): string {
  const codeStr = errorCode ? String(errorCode) : '';
  const msgStr = (errorMessage || '').toLowerCase();

  if (codeStr === '63015' || msgStr.includes('joined the sandbox') || msgStr.includes('channel sandbox')) {
    return 'RECIPIENT_SANDBOX_UNENROLLED';
  }
  if (['63001', '63002', '63003', '63005', '63007', '63016', '63018', '21211'].includes(codeStr) || msgStr.includes('recipient') || msgStr.includes('not a valid whatsapp number')) {
    return 'RECIPIENT_RESTRICTION';
  }
  if (msgStr.includes('network') || msgStr.includes('timeout') || msgStr.includes('unavailable') || codeStr.startsWith('5')) {
    return 'PROVIDER_NETWORK_FAILURE';
  }
  if (codeStr || msgStr) {
    return 'TWILIO_DELIVERY_FAILURE';
  }
  return 'NONE';
}

const STATUS_RANK: Record<string, number> = {
  queued: 1,
  accepted: 2,
  sending: 3,
  sent: 4,
  delivered: 5,
  read: 6,
  failed: 10,
  undelivered: 10,
};

@Controller('whatsapp')
export class WhatsAppWebhookController {
  private readonly logger = new Logger(WhatsAppWebhookController.name);

  constructor(private readonly firebaseService: FirebaseService) {}

  /**
   * POST /api/whatsapp/twilio/callback
   * Twilio StatusCallback webhook handler with signature authentication,
   * status handling, error 63015 sandbox classification, and idempotent persistence.
   */
  @Post('twilio/callback')
  @UseGuards(TwilioSignatureGuard)
  async handleTwilioCallback(@Body() body: any, @Req() req: Request, @Res() res: Response) {
    const payload = body || req.body || {};
    const messageSid = payload.MessageSid || payload.SmsSid;
    const messageStatus = payload.MessageStatus || payload.SmsStatus || 'unknown';
    const errorCode = payload.ErrorCode;
    const errorMessage = payload.ErrorMessage;
    const to = payload.To;
    const from = payload.From;
    const accountSid = payload.AccountSid;
    const channelPrefix = payload.ChannelPrefix || (to && String(to).startsWith('whatsapp:') ? 'whatsapp' : 'sms');

    this.logger.log(
      `[WhatsApp Webhook] Twilio status callback received: sid=${messageSid}, status=${messageStatus}, to=${to}, errorCode=${errorCode || 'NONE'}`
    );

    if (messageSid) {
      try {
        const db = this.firebaseService.getDb();
        const logsSnap = await db.collection('notificationLogs')
          .where('messageId', '==', messageSid)
          .get();

        const errorCategory = categorizeTwilioError(errorCode, errorMessage);
        const callbackTimestamp = new Date();

        const callbackEvent = {
          status: messageStatus,
          timestamp: callbackTimestamp,
          ...(errorCode ? { errorCode: String(errorCode) } : {}),
          ...(errorMessage ? { errorMessage: String(errorMessage) } : {}),
          ...(errorCategory !== 'NONE' ? { errorCategory } : {}),
        };

        if (!logsSnap.empty) {
          for (const doc of logsSnap.docs) {
            const currentData = doc.data();
            const currentRank = STATUS_RANK[currentData.deliveryStatus] || 0;
            const newRank = STATUS_RANK[messageStatus] || 0;

            const updateData: Record<string, any> = {
              updatedAt: callbackTimestamp,
              callbackReceivedAt: callbackTimestamp,
              ...(messageSid ? { messageSid } : {}),
              ...(to ? { to } : {}),
              ...(from ? { from } : {}),
              ...(accountSid ? { accountSid } : {}),
              ...(channelPrefix ? { channelPrefix } : {}),
              ...(errorCode ? { errorCode: String(errorCode) } : {}),
              ...(errorMessage ? { errorMessage: String(errorMessage) } : {}),
              ...(errorCategory !== 'NONE' ? { errorCategory } : {}),
            };

            // Only update deliveryStatus if the new status is equal or higher in precedence
            // (e.g. do not downgrade 'read' or 'delivered' to 'sending' if retried out-of-order)
            if (newRank >= currentRank || currentRank === 0) {
              updateData.deliveryStatus = messageStatus;
              if (messageStatus === 'failed' || messageStatus === 'undelivered') {
                updateData.success = false;
                if (errorMessage || errorCode) {
                  updateData.failureReason = errorMessage || `Twilio Error ${errorCode}`;
                }
              } else if (messageStatus === 'delivered' || messageStatus === 'read' || messageStatus === 'sent') {
                updateData.success = true;
              }
            }

            // Append to status callback history array
            const history = Array.isArray(currentData.callbackHistory) ? currentData.callbackHistory : [];
            updateData.callbackHistory = [...history, callbackEvent];

            await doc.ref.update(updateData);
          }
          this.logger.log(`[WhatsApp Webhook] Updated ${logsSnap.size} notificationLog records for MessageSid ${messageSid}`);
        } else {
          // If no notificationLog found yet, persist standalone status callback record so state is not lost
          await db.collection('notificationLogs').add({
            messageId: messageSid,
            MessageSid: messageSid,
            deliveryStatus: messageStatus,
            MessageStatus: messageStatus,
            event: 'twilio_status_callback',
            channel: channelPrefix === 'whatsapp' ? 'whatsapp' : 'sms',
            provider: 'twilio',
            to: to || null,
            To: to || null,
            from: from || null,
            From: from || null,
            accountSid: accountSid || null,
            AccountSid: accountSid || null,
            channelPrefix: channelPrefix || 'whatsapp',
            ChannelPrefix: channelPrefix || 'whatsapp',
            recipient: { phone: to || null },
            success: messageStatus !== 'failed' && messageStatus !== 'undelivered',
            ...(errorCode ? { errorCode: String(errorCode), ErrorCode: String(errorCode) } : {}),
            ...(errorMessage ? { errorMessage: String(errorMessage), ErrorMessage: String(errorMessage) } : {}),
            ...(errorCategory !== 'NONE' ? { errorCategory } : {}),
            timestamp: callbackTimestamp,
            callbackReceivedAt: callbackTimestamp,
            callbackHistory: [callbackEvent],
          });
          this.logger.log(`[WhatsApp Webhook] Created new notificationLog record for standalone MessageSid ${messageSid}`);
        }
      } catch (err: any) {
        this.logger.error(`[WhatsApp Webhook] Error updating status for MessageSid ${messageSid}: ${err.message}`, err.stack);
      }
    }

    // Always respond with 200 OK TwiML or empty response for Twilio callbacks
    return res.status(HttpStatus.OK).send('<Response></Response>');
  }

  /**
   * POST /api/whatsapp/feedback
   * Capture structured feedback from trial expired feedback response.
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
