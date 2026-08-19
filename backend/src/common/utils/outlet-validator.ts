import { NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import * as admin from 'firebase-admin';

export interface ValidatedOutlet {
  id: string;
  name: string;
  status: string;
  isActive: boolean;
  isDeleted?: boolean;
  customerId?: string;
  ownerId?: string;
  [key: string]: any;
}

const outletCache = new Map<string, { data: ValidatedOutlet; expiresAt: number }>();

export function clearOutletCache(outletId?: string): void {
  if (outletId) {
    outletCache.delete(outletId);
  } else {
    outletCache.clear();
  }
}

export async function validateActiveOutlet(
  db: admin.firestore.Firestore,
  outletId: string,
  user?: { uid?: string; email?: string; role?: string; customerId?: string },
  cacheService?: any,
): Promise<ValidatedOutlet> {
  if (!outletId) {
    throw new BadRequestException('Outlet ID is required');
  }

  let outlet: ValidatedOutlet | null = null;
  const cacheKey = `outlet:${outletId}`;

  if (cacheService && typeof cacheService.get === 'function') {
    try {
      outlet = await cacheService.get(cacheKey);
    } catch {}
  }

  if (!outlet) {
    const cachedLocal = outletCache.get(outletId);
    if (cachedLocal && cachedLocal.expiresAt > Date.now()) {
      outlet = cachedLocal.data;
    }
  }

  if (!outlet) {
    const docRef = db.collection('outlets').doc(outletId);
    const snap = await docRef.get();

    if (!snap.exists) {
      throw new NotFoundException(`Outlet ${outletId} not found`);
    }

    const data = snap.data() || {};
    outlet = { id: snap.id, ...data } as ValidatedOutlet;

    outletCache.set(outletId, { data: outlet, expiresAt: Date.now() + 10 * 60 * 1000 });
    if (cacheService && typeof cacheService.set === 'function') {
      try {
        await cacheService.set(cacheKey, outlet, 600);
      } catch {}
    }
  }

  if (outlet.status === 'removed' || outlet.isDeleted === true || outlet.status === 'deleted') {
    throw new NotFoundException(`Outlet ${outletId} is no longer available`);
  }

  if (user && user.role !== 'admin' && user.role !== 'super_admin') {
    const isDirectOwner = (outlet.ownerId && outlet.ownerId === user.uid) || outlet.userId === user.uid;
    const isAssigned = Array.isArray((user as any).assignedOutletIds) && (user as any).assignedOutletIds.includes(outletId);
    if (!isDirectOwner && !isAssigned && user.customerId && outlet.customerId && outlet.customerId !== user.customerId) {
      throw new ForbiddenException(`Access denied to outlet ${outletId}`);
    }
  }

  return outlet;
}
