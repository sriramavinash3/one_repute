import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { FirebaseService } from '../firebase/firebase.service';
import { PrismaService } from '../prisma/prisma.service';
import { PaymentsConfigService } from './payments-config.service';
import { WhatsAppService } from '../whatsapp/whatsapp.service';
import { EmailService } from '../email/services/email.service';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly firebaseService: FirebaseService,
    private readonly prismaService: PrismaService,
    private readonly configService: PaymentsConfigService,
    private readonly whatsappService: WhatsAppService,
    private readonly emailService: EmailService,
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
        const now = new Date();
        let inTrial = false;
        if (customerData.trialEndDate) {
          const tEnd = customerData.trialEndDate.toDate ? customerData.trialEndDate.toDate() : new Date(customerData.trialEndDate);
          if (tEnd.getTime() > now.getTime()) {
            inTrial = true;
          }
        }

        statusUpdate = {
          subscriptionStatus: 'active',
          paymentStatus: 'paid',
          hasConvertedToPaid: true,
          renewalDate: new Date(renewalTime),
          updatedAt: new Date(),
        };

        if (customerData.scheduledPlan) {
          statusUpdate.plan = customerData.scheduledPlan;
        }


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

        // Trigger PLAN_ACTIVATED WhatsApp template
        try {
          const outletsSnap = await db.collection('outlets').where('customerId', '==', customerId).limit(1).get();
          if (!outletsSnap.empty) {
            const outletDoc = outletsSnap.docs[0];
            const outlet = outletDoc.data();
            const phone = outlet.whatsappNumber || outlet.primaryWhatsAppNumber || customerData.phone;
            if (phone) {
              const appUrl = process.env.APP_URL || 'https://app.onerepute.com';
              await this.whatsappService.sendTemplateByName({
                templateKey: 'PLAN_ACTIVATED',
                toNumber: phone,
                variables: {
                  Name: customerData.name || outlet.name || 'Customer',
                  'Plan Name': (customerData.plan || 'Growth').replace('plan_', '').toUpperCase(),
                  'Outlet Name': outlet.name || 'Business',
                  Link: `${appUrl}/outlet/dashboard`,
                },
                idempotencyKey: `plan_activated_${customerId}`,
                outletId: outletDoc.id,
                customerId,
                planName: customerData.plan || 'growth',
                isPaid: true,
              });
            }
          }
        } catch (waErr: any) {
          this.logger.warn(`Could not send PLAN_ACTIVATED WhatsApp: ${waErr.message}`);
        }

        // Trigger Subscription Confirmation Email
        try {
          const recipientEmail = customerData.email || customerData.userEmail;
          if (recipientEmail) {
            const formattedPlanName = (customerData.plan || 'growth').replace('plan_', '').toUpperCase();
            const formattedRenewalDate = new Date(renewalTime).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
            
            await this.emailService.sendSubscriptionActivated({
              recipientEmail,
              userName: customerData.name || recipientEmail.split('@')[0],
              planName: formattedPlanName,
              amountPaid: `${customerData.currency || 'INR'} ${entity.amount ? Math.round(entity.amount / 100) : ''} / ${customerData.billingCycle || 'monthly'}`,
              renewalDate: formattedRenewalDate,
              idempotencyKey: `sub_act_${subscriptionId}`,
            });
          }
        } catch (emailErr: any) {
          this.logger.warn(`Could not send Subscription Confirmation email via webhook: ${emailErr.message}`);
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
