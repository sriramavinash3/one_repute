/**
 * backend/scripts/sendGreetingToAllUsers.ts
 * 
 * Production-ready batch greeting email dispatcher.
 * Resolves all active users across Firebase Auth, Firestore, and Prisma PostgreSQL,
 * deduplicates recipient emails, and dispatches greeting emails via ResendService.
 * 
 * Usage:
 *   Dry-run (default): npx ts-node scripts/sendGreetingToAllUsers.ts
 *   Live execution:    npx ts-node scripts/sendGreetingToAllUsers.ts --live
 */

import * as path from 'path';
import * as dotenv from 'dotenv';
import * as React from 'react';

// Ensure environment variables are loaded
dotenv.config({ path: path.join(__dirname, '../.env') });

import * as admin from 'firebase-admin';
import { PrismaClient } from '@prisma/client';
import { loadEmailConfig } from '../src/config/email.config';
import { ResendService } from '../src/modules/email/resend/resend.service';
import WelcomeEmail from '../src/emails/Welcome';

interface UserRecipient {
  email: string;
  name: string;
  source: string;
}

async function getAllUsers(): Promise<UserRecipient[]> {
  const recipientsMap = new Map<string, UserRecipient>();

  // 1. Firebase Auth & Firestore Users
  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

  if (projectId && clientEmail && privateKey) {
    if (admin.apps.length === 0) {
      admin.initializeApp({
        credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
        projectId,
      });
    }

    const auth = admin.auth();
    const db = admin.firestore();

    // 1a. Firebase Auth
    try {
      let pageToken: string | undefined;
      do {
        const res = await auth.listUsers(1000, pageToken);
        res.users.forEach((u) => {
          if (u.email) {
            const emailClean = u.email.trim().toLowerCase();
            const displayName = u.displayName || u.email.split('@')[0] || 'Valued Partner';
            recipientsMap.set(emailClean, {
              email: emailClean,
              name: displayName,
              source: 'Firebase Auth',
            });
          }
        });
        pageToken = res.pageToken;
      } while (pageToken);
    } catch (err: any) {
      console.warn(`[WARN] Firebase Auth fetch warning: ${err.message}`);
    }

    // 1b. Firestore 'customers' collection for additional names/emails
    try {
      const customersSnap = await db.collection('customers').get();
      customersSnap.forEach((doc) => {
        const data = doc.data();
        if (data.email) {
          const emailClean = data.email.trim().toLowerCase();
          const existing = recipientsMap.get(emailClean);
          const name = data.name || data.companyName || existing?.name || emailClean.split('@')[0];
          recipientsMap.set(emailClean, {
            email: emailClean,
            name,
            source: existing ? `${existing.source} + Firestore Customers` : 'Firestore Customers',
          });
        }
      });
    } catch (err: any) {
      console.warn(`[WARN] Firestore customers fetch warning: ${err.message}`);
    }
  }

  // 2. Prisma PostgreSQL Users
  if (process.env.DATABASE_URL) {
    try {
      const prisma = new PrismaClient();
      const dbUsers = await prisma.user.findMany();
      dbUsers.forEach((u) => {
        if (u.email) {
          const emailClean = u.email.trim().toLowerCase();
          const existing = recipientsMap.get(emailClean);
          const name = u.name || existing?.name || emailClean.split('@')[0];
          recipientsMap.set(emailClean, {
            email: emailClean,
            name,
            source: existing ? `${existing.source} + Postgres` : 'Postgres',
          });
        }
      });
      await prisma.$disconnect();
    } catch (err: any) {
      console.warn(`[WARN] Prisma user fetch warning: ${err.message}`);
    }
  }

  return Array.from(recipientsMap.values());
}

async function run() {
  const isLive = process.argv.includes('--live');

  console.log('====================================================');
  console.log(` ONE REPUTE - GREETING EMAIL BROADCASTER`);
  console.log(` MODE: ${isLive ? '🚀 LIVE BROADCAST' : '🔍 DRY-RUN PREVIEW'}`);
  console.log('====================================================\n');

  const recipients = await getAllUsers();
  console.log(`Found ${recipients.length} total unique user recipients:\n`);

  recipients.forEach((r, idx) => {
    console.log(`  ${String(idx + 1).padStart(2, ' ')}. ${r.name.padEnd(25, ' ')} <${r.email}> [Source: ${r.source}]`);
  });

  const config = loadEmailConfig();
  // Ensure live frontend URL is used for email buttons (defaulting to https://onerepute.com)
  const frontendUrl = process.env.FRONTEND_BASE_URL || 'https://onerepute.com';
  const resendService = new ResendService();

  console.log(`\nEmail Configuration:`);
  console.log(`  From:         ${config.emailFrom}`);
  console.log(`  Frontend URL: ${frontendUrl}`);
  console.log(`  Dashboard URL:${frontendUrl}/dashboard`);
  console.log(`  Support Email:${config.supportEmail}`);

  if (!isLive) {
    console.log('\n----------------------------------------------------');
    console.log(' DRY-RUN COMPLETE. No actual emails were sent.');
    console.log(' To send live emails, execute with --live flag:');
    console.log('   npx ts-node scripts/sendGreetingToAllUsers.ts --live');
    console.log('----------------------------------------------------\n');
    return;
  }

  console.log('\n----------------------------------------------------');
  console.log(' STARTING LIVE BROADCAST DISPATCH...');
  console.log('----------------------------------------------------\n');

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < recipients.length; i++) {
    const recipient = recipients[i];
    console.log(`[${i + 1}/${recipients.length}] Sending greeting email to ${recipient.name} <${recipient.email}>...`);

    try {
      const templateComponent = React.createElement(WelcomeEmail, {
        userName: recipient.name,
        dashboardUrl: `${frontendUrl}/dashboard`,
        supportEmail: config.supportEmail,
      });

      const sanitizedEmailTag = recipient.email.replace(/[^a-zA-Z0-9_-]/g, '_');

      const result = await resendService.sendEmail({
        to: recipient.email,
        subject: 'Welcome to OneRepute 🚀 — Automate your brand reputation in real-time',
        templateComponent,
        tags: [
          { name: 'category', value: 'greeting_broadcast' },
          { name: 'recipient', value: sanitizedEmailTag },
        ],
      });

      if (result.status === 'sent' || result.status === 'mocked') {
        console.log(`    ✅ SUCCESS [${result.status.toUpperCase()}] ID: ${result.id} (${result.latencyMs}ms)`);
        successCount++;
      } else {
        console.error(`    ❌ FAILED: ${result.error || 'Unknown error'}`);
        failCount++;
      }
    } catch (err: any) {
      console.error(`    ❌ EXCEPTION sending to ${recipient.email}: ${err.message}`);
      failCount++;
    }

    // Rate-limiting pause: 300ms delay between dispatches
    if (i < recipients.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
  }

  console.log('\n====================================================');
  console.log(` BROADCAST SUMMARY:`);
  console.log(`   Total Recipients: ${recipients.length}`);
  console.log(`   Successfully Dispatched: ${successCount}`);
  console.log(`   Failed: ${failCount}`);
  console.log('====================================================\n');
}

run()
  .catch((err) => {
    console.error('Fatal error executing greeting broadcast:', err);
    process.exit(1);
  })
  .finally(() => {
    process.exit(0);
  });
