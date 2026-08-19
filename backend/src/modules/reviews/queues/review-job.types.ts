/**
 * src/modules/reviews/queues/review-job.types.ts
 *
 * Types and interfaces for the Review Processing Engine job queues.
 */

export enum ReviewJobType {
  SYNC_OUTLET = 'review:sync-outlet',
  ENRICH_AI = 'review:enrich-ai',
  RUN_AUTOMATION = 'review:run-automation',
}

export type SyncJobStage =
  | 'QUEUED'
  | 'FETCHING'
  | 'PERSISTING'
  | 'ENRICHING'
  | 'COMPLETED'
  | 'FAILED'
  | 'SKIPPED';

export interface SyncOutletJobPayload {
  jobId: string;
  outletId: string;
  skipCooldown?: boolean;
  triggerSource?: 'manual' | 'scheduler' | 'onboarding' | 'retry';
}

export interface EnrichAIJobPayload {
  jobId: string;
  reviewId: string;
  outletId: string;
  outletName: string;
  rating: number;
  reviewText: string;
  customerName: string;
  aiVersion?: string;
  isFirstOnboardingSync?: boolean;
}

export interface RunAutomationJobPayload {
  jobId: string;
  reviewId: string;
  outletId: string;
  outletName: string;
  rating: number;
  reviewText: string;
  customerName: string;
  managerPhone?: string;
  managerEmail?: string;
  isImported?: boolean;
}

export interface SyncJobStatus {
  jobId: string;
  outletId: string;
  status: SyncJobStage;
  fetchedCount: number;
  newCount: number;
  processedCount: number;
  enrichedCount: number;
  stage: SyncJobStage;
  error?: string | null;
  startedAt: string;
  updatedAt: string;
  completedAt?: string | null;
}

export interface SyncResult {
  outletId: string;
  outletName: string;
  fetched: number;
  new: number;
  processed: number;
  status: 'success' | 'error' | 'skipped';
  error?: string;
}
