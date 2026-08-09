import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as admin from 'firebase-admin';
import { FirebaseService } from '../firebase/firebase.service';
import { SaveEscalationSettingsDto } from './dto/escalation.dto';
import { validateActiveOutlet } from '../../common/utils/outlet-validator';

const PLAN_MAX_LEVELS: Record<string, number> = {
  enterprise: 3,
  premium: 2,
  pro: 2,
  growth: 1,
  starter: 0,
  default: 2,
};

function getPlanMaxLevel(planName = ''): number {
  const plan = (planName || '').toLowerCase();
  for (const [key, level] of Object.entries(PLAN_MAX_LEVELS)) {
    if (plan.includes(key)) return level;
  }
  return PLAN_MAX_LEVELS.default;
}

export interface EscalationLevelConfig {
  level: number;
  name: string;
  designation: string;
  countryCode: string;
  whatsappNumber: string;
  email: string;
  escalationMinutes: number;
  enabled: boolean;
}

export interface EscalationSettingsResponse {
  masterEnabled: boolean;
  creditsExhausted: boolean;
  plan: string;
  maxAllowedLevel: number;
  levels: EscalationLevelConfig[];
}

@Injectable()
export class EscalationService {
  private readonly logger = new Logger(EscalationService.name);

  constructor(private readonly firebaseService: FirebaseService) {}

  /**
   * Get escalation settings for an outlet (or resolve default if unset)
   */
  async getSettings(outletId: string, customerId?: string, user?: { uid?: string; email?: string; role?: string; customerId?: string }): Promise<EscalationSettingsResponse> {
    const db = this.firebaseService.getDb();
    await validateActiveOutlet(db, outletId, user);

    // 1. Fetch escalation settings doc from Firestore
    let docSnap;
    try {
      docSnap = await db.collection('escalationSettings').doc(outletId).get();
    } catch (err: any) {
      this.logger.error(`Failed to fetch escalation settings for outlet ${outletId}: ${err.message}`);
    }

    const data = docSnap && docSnap.exists ? docSnap.data() || {} : {};

    // 2. Fetch customer plan & credit status if customerId provided
    let plan = 'pro';
    let creditsExhausted = false;

    const resolvedCustomerId = customerId || (await this.resolveCustomerId(db, user));
    if (resolvedCustomerId) {
      try {
        const customerSnap = await db.collection('customers').doc(resolvedCustomerId).get();
        if (customerSnap.exists) {
          const cust = customerSnap.data() || {};
          plan = cust.planName || cust.plan || 'pro';
          creditsExhausted = cust.aiCredits ? cust.aiCredits <= 0 : false;
        }
      } catch (err: any) {
        this.logger.warn(`Could not fetch customer details for escalation settings: ${err.message}`);
      }
    }

    const maxAllowedLevel = getPlanMaxLevel(plan);
    const masterEnabled = data.masterEnabled !== undefined ? Boolean(data.masterEnabled) : true;

    // 3. Build level list (1, 2, 3)
    const savedLevels = data.levels || {};
    const defaultDefaults: Record<number, Partial<EscalationLevelConfig>> = {
      1: { escalationMinutes: 15 },
      2: { escalationMinutes: 60 },
      3: { escalationMinutes: 180 },
    };

    const levels: EscalationLevelConfig[] = [1, 2, 3].map((lvlNum) => {
      const saved = savedLevels[lvlNum] || savedLevels[`level_${lvlNum}`] || {};
      return {
        level: lvlNum,
        name: saved.name || '',
        designation: saved.designation || '',
        countryCode: saved.countryCode || '+91',
        whatsappNumber: saved.whatsappNumber || '',
        email: saved.email || '',
        escalationMinutes: Number(saved.escalationMinutes) || defaultDefaults[lvlNum].escalationMinutes || 15,
        enabled: saved.enabled !== false,
      };
    });

    return {
      masterEnabled,
      creditsExhausted,
      plan,
      maxAllowedLevel,
      levels,
    };
  }

  /**
   * Save or update escalation settings for an outlet
   */
  async saveSettings(outletId: string, dto: SaveEscalationSettingsDto, user?: { uid?: string; email?: string; role?: string; customerId?: string }): Promise<{ success: boolean; message: string }> {
    const db = this.firebaseService.getDb();
    await validateActiveOutlet(db, outletId, user);
    const docRef = db.collection('escalationSettings').doc(outletId);

    const docSnap = await docRef.get();
    const existing = docSnap.exists ? docSnap.data() || {} : {};

    // Enforce plan gating on save: level beyond plan max is rejected
    if (dto.level !== undefined) {
      const plan = await this.resolveCustomerPlan(db, user);
      const maxAllowedLevel = getPlanMaxLevel(plan);
      if (dto.level > maxAllowedLevel) {
        throw new ForbiddenException(
          `Level ${dto.level} requires ${Object.entries(PLAN_MAX_LEVELS).find(([, max]) => max === dto.level)?.[0] || 'a higher'} plan. Your current plan supports up to level ${maxAllowedLevel}.`,
        );
      }
    }

    if (dto.masterEnabled !== undefined) {
      existing.masterEnabled = dto.masterEnabled;
    }

    if (dto.level !== undefined) {
      if (!existing.levels) existing.levels = {};
      existing.levels[dto.level] = {
        level: dto.level,
        name: dto.name || '',
        designation: dto.designation || '',
        countryCode: dto.countryCode || '+91',
        whatsappNumber: dto.whatsappNumber || '',
        email: dto.email || '',
        escalationMinutes: Number(dto.escalationMinutes) || (dto.level === 1 ? 15 : dto.level === 2 ? 60 : 180),
        enabled: dto.enabled !== false,
        updatedAt: new Date().toISOString(),
      };
    }

    existing.updatedAt = admin.firestore.FieldValue.serverTimestamp();

    await docRef.set(existing, { merge: true });
    this.logger.log(`Escalation settings saved for outlet ${outletId}`);

    return { success: true, message: 'Escalation settings updated successfully.' };
  }

  /**
   * Clear configuration for a specific level
   */
  async deleteLevel(outletId: string, level: number, user?: { uid?: string; email?: string; role?: string; customerId?: string }): Promise<{ success: boolean; message: string }> {
    const db = this.firebaseService.getDb();
    await validateActiveOutlet(db, outletId, user);
    const docRef = db.collection('escalationSettings').doc(outletId);

    const docSnap = await docRef.get();
    if (docSnap.exists) {
      const data = docSnap.data() || {};
      if (data.levels && data.levels[level]) {
        delete data.levels[level];
        await docRef.set(data, { merge: true });
      }
    }

    return { success: true, message: `Level ${level} configuration cleared.` };
  }

  /**
   * Fetch escalation history logs for an outlet
   */
  async getHistory(outletId: string, user?: { uid?: string; email?: string; role?: string; customerId?: string }) {
    const db = this.firebaseService.getDb();
    await validateActiveOutlet(db, outletId, user);
    try {
      const snap = await db.collection('activityLogs')
        .where('outletId', '==', outletId)
        .limit(50)
        .get();

      return snap.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter((item: any) => (item.type || '').startsWith('ESCALATION'));
    } catch (err: any) {
      this.logger.error(`Failed to fetch escalation history: ${err.message}`);
      return [];
    }
  }

  /**
   * Fetch escalation status for a specific review
   */
  async getReviewStatus(reviewId: string) {
    const db = this.firebaseService.getDb();
    const docSnap = await db.collection('reviews').doc(reviewId).get();

    if (!docSnap.exists) {
      throw new NotFoundException(`Review ${reviewId} not found`);
    }

    const data = docSnap.data() || {};
    return {
      reviewId,
      status: data.status,
      escalationStatus: data.escalationStatus || 'none',
      escalationLevel: data.escalationLevel || 0,
      nextEscalationTime: data.nextEscalationTime || null,
      escalationInitiatedAt: data.escalationInitiatedAt || null,
      lastEscalatedAt: data.lastEscalatedAt || null,
    };
  }

  /**
   * Resolve the customerId for a user (direct on the user or users/{uid} doc)
   */
  private async resolveCustomerId(
    db: FirebaseFirestore.Firestore,
    user?: { uid?: string; email?: string; role?: string; customerId?: string },
  ): Promise<string | null> {
    if (user?.customerId) return user.customerId;
    if (!user?.uid) return null;
    try {
      const userSnap = await db.collection('users').doc(user.uid).get();
      if (userSnap.exists) {
        const data = userSnap.data() || {};
        return data.customerId || data.customer_id || null;
      }
    } catch (err: any) {
      this.logger.warn(`Could not resolve customerId for user ${user.uid}: ${err.message}`);
    }
    return null;
  }

  /**
   * Resolve the customer's plan name for plan-gating decisions
   */
  private async resolveCustomerPlan(
    db: FirebaseFirestore.Firestore,
    user?: { uid?: string; email?: string; role?: string; customerId?: string },
  ): Promise<string> {
    const customerId = await this.resolveCustomerId(db, user);
    if (!customerId) return 'pro';
    try {
      const customerSnap = await db.collection('customers').doc(customerId).get();
      if (customerSnap.exists) {
        const cust = customerSnap.data() || {};
        return cust.planName || cust.plan || 'pro';
      }
    } catch (err: any) {
      this.logger.warn(`Could not fetch customer plan: ${err.message}`);
    }
    return 'pro';
  }
}
