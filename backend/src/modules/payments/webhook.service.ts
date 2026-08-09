import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { FirebaseService } from '../firebase/firebase.service';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsConfigService } from './payments-config.service';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly firebaseService: FirebaseService,
    private readonly prismaService: PrismaService,
    private readonly configService: PaymentsConfigService,
  ) {}

  verifySignature(rawBody: string, signature: string): boolean {
    const secret = this.configService.razorpayWebhookSecret;
    if (!secret) {
      this.logger.error('Missing RAZORPAY_WEBHOOK_SECRET environment variable!');
      return false;
    }
    const shasum = crypto.createHmac('sha256', secret);
    shasum.update(rawBody);
    const digest = shasum.digest('hex');
    return digest === signature;
  }

  async processWebhook(payload: any) {
    if (!payload) return false;

    const event = payload.event;
    const entity = payload.payload?.subscription?.entity || payload.payload?.payment?.entity || {};
    const subscriptionId = entity.id || entity.subscription_id;

    if (!subscriptionId) {
      this.logger.warn('No subscriptionId present in webhook event payload');
      return true;
    }

    const db = this.firebaseService.getDb();

    // Idempotency check: process each event ID once
    const eventId = payload.created_at + '_' + event + '_' + subscriptionId;
    const eventRef = db.collection('processedWebhookEvents').doc(eventId);
    const eventDoc = await eventRef.get();
    if (eventDoc.exists) {
      this.logger.log(`Duplicate webhook event bypassed: ${eventId}`);
      return true;
    }
    await eventRef.set({ processedAt: new Date() });

    // Transaction logging to PG if DATABASE_URL set
    if (process.env.DATABASE_URL) {
      try {
        await this.prismaService.transaction.create({
          data: {
            id: eventId,
            customerId: subscriptionId,
            type: event,
            description: `Razorpay webhook event: ${event}`,
            amount: entity.amount ? Math.round(entity.amount / 100) : 0,
            currency: entity.currency || 'INR',
          },
        });
      } catch (err: any) {
        this.logger.error(`Prisma webhook logging failed: ${err.message}`);
      }
    }

    const customersSnap = await db.collection('customers')
      .where('razorpaySubscriptionId', '==', subscriptionId)
      .limit(1)
      .get();

    if (customersSnap.empty) {
      this.logger.warn(`Customer not found for webhook subscriptionId: ${subscriptionId}`);
      return true;
    }

    const customerDoc = customersSnap.docs[0];
    const customerId = customerDoc.id;
    const customerData = customerDoc.data();

    this.logger.log(`Processing webhook event: ${event} for customer: ${customerId}`);

    let statusUpdate: any = {};
    const renewalTime = entity.current_end ? entity.current_end * 1000 : (Date.now() + 30 * 24 * 60 * 60 * 1000);

    switch (event) {
      case 'subscription.activated':
      case 'subscription.charged':
      case 'invoice.paid':
        statusUpdate = {
          subscriptionStatus: 'active',
          paymentStatus: 'paid',
          renewalDate: new Date(renewalTime),
          updatedAt: new Date(),
        };

        // Cache invalidated cleanly

        if (payload.payload?.invoice?.entity) {
          const invoice = payload.payload.invoice.entity;
          const invoiceAmount = invoice.amount / 100;
          await db.collection('invoices').add({
            customerId,
            invoiceId: invoice.id,
            amount: invoiceAmount,
            currency: invoice.currency,
            status: 'paid',
            issuedAt: new Date(invoice.issued_at * 1000),
            createdAt: new Date(),
          });

          if (process.env.DATABASE_URL) {
            try {
              await this.prismaService.invoice.upsert({
                where: { id: invoice.id },
                update: {
                  status: 'paid',
                },
                create: {
                  id: invoice.id,
                  customerId,
                  amount: invoiceAmount,
                  currency: invoice.currency,
                  status: 'paid',
                  issuedAt: new Date(invoice.issued_at * 1000),
                },
              });
            } catch (err: any) {
              this.logger.error(`Prisma invoice sync failed: ${err.message}`);
            }
          }
        }

        try {
          this.logger.log(`Subscription activated confirmation ready for ${customerData.email || 'customer@onerepute.com'}`);
        } catch (err: any) {
          this.logger.warn(`Could not trigger confirmation email: ${err.message}`);
        }
        break;

      case 'subscription.cancelled':
        statusUpdate = {
          subscriptionStatus: 'cancelled',
          renewalDate: new Date(renewalTime),
          updatedAt: new Date(),
        };
        break;

      case 'subscription.paused':
        statusUpdate = {
          subscriptionStatus: 'paused',
          updatedAt: new Date(),
        };
        break;

      case 'payment.failed':
        statusUpdate = {
          paymentStatus: 'failed',
          subscriptionStatus: 'past_due',
          updatedAt: new Date(),
        };
        break;
    }

    if (Object.keys(statusUpdate).length > 0) {
      await db.collection('customers').doc(customerId).set(statusUpdate, { merge: true });

      if (process.env.DATABASE_URL) {
        try {
          await this.prismaService.subscription.upsert({
            where: { id: subscriptionId },
            update: {
              status: statusUpdate.subscriptionStatus || 'active',
              renewalDate: statusUpdate.renewalDate || new Date(renewalTime),
            },
            create: {
              id: subscriptionId,
              customerId,
              planId: customerData.plan || 'plan_starter',
              billingCycle: customerData.billingCycle || 'monthly',
              status: statusUpdate.subscriptionStatus || 'active',
              currency: customerData.currency || 'INR',
              renewalDate: statusUpdate.renewalDate || new Date(renewalTime),
            },
          });
        } catch (err: any) {
          this.logger.error(`Prisma webhook subscription sync failed: ${err.message}`);
        }
      }
    }

    return true;
  }
}
