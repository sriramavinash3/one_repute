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

export async function validateActiveOutlet(
  db: admin.firestore.Firestore,
  outletId: string,
  user?: { uid?: string; email?: string; role?: string; customerId?: string }
): Promise<ValidatedOutlet> {
  if (!outletId) {
    throw new BadRequestException('Outlet ID is required');
  }

  const docRef = db.collection('outlets').doc(outletId);
  const snap = await docRef.get();

  if (!snap.exists) {
    throw new NotFoundException(`Outlet ${outletId} not found`);
  }

  const data = snap.data() || {};

  if (data.status === 'removed' || data.isDeleted === true || data.status === 'deleted') {
    throw new NotFoundException(`Outlet ${outletId} is no longer available`);
  }

  if (user && user.role !== 'admin' && user.role !== 'super_admin') {
    if (user.customerId && data.customerId && data.customerId !== user.customerId) {
      throw new ForbiddenException(`Access denied to outlet ${outletId}`);
    }
  }

  return { id: snap.id, ...data } as ValidatedOutlet;
}
