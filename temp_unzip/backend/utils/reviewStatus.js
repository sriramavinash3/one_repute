/**
 * utils/reviewStatus.js
 *
 * Centralized review status definitions and transition rules.
 */

'use strict';

const STATUS = {
  PENDING: 'pending',
  SUGGESTED: 'suggested',
  ESCALATED: 'escalated',
  RESPONDED: 'responded',
  FAILED: 'failed',
};

const TRANSITIONS = {
  [STATUS.PENDING]: [STATUS.SUGGESTED, STATUS.ESCALATED, STATUS.RESPONDED, STATUS.FAILED],
  [STATUS.SUGGESTED]: [STATUS.RESPONDED, STATUS.FAILED],
  [STATUS.ESCALATED]: [STATUS.RESPONDED, STATUS.FAILED],
  [STATUS.RESPONDED]: [],
  [STATUS.FAILED]: [],
};

function normalizeStatus(status) {
  if (!status) return STATUS.PENDING;
  const value = String(status).toLowerCase();
  if (value === 'reply_pending') return STATUS.SUGGESTED;
  return Object.values(STATUS).includes(value) ? value : STATUS.PENDING;
}

function isValidStatus(status) {
  if (!status) return false;
  const value = String(status).toLowerCase();
  if (value === 'reply_pending') return true;
  return Object.values(STATUS).includes(value);
}

function canTransition(fromStatus, toStatus) {
  const from = normalizeStatus(fromStatus);
  const to = normalizeStatus(toStatus);
  if (from === to) return true;
  const allowed = TRANSITIONS[from] || [];
  return allowed.includes(to);
}

module.exports = {
  STATUS,
  normalizeStatus,
  isValidStatus,
  canTransition,
};
