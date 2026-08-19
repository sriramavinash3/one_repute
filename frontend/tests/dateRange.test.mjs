/**
 * Unit tests for frontend/src/utils/dateRange.js
 * Run with: node --test tests/
 */

import test from 'node:test'
import assert from 'node:assert/strict'

import {
  computeDateRange,
  parseDateInput,
  getReviewTimestampMs,
  inDateRange,
  formatRangeLabel,
  toDateInputValue,
  startOfDay,
  endOfDay,
} from '../src/utils/dateRange.js'

// Fixed "now" — 2026-08-13 14:30 local (constructor args are local time).
const NOW = new Date(2026, 7, 13, 14, 30, 0, 0)

test('today preset covers the full local day', () => {
  const { from, to } = computeDateRange('today', null, NOW)
  assert.equal(from.getFullYear(), 2026)
  assert.equal(from.getMonth(), 7)
  assert.equal(from.getDate(), 13)
  assert.equal(from.getHours(), 0)
  assert.equal(from.getMinutes(), 0)
  assert.equal(to.getHours(), 23)
  assert.equal(to.getMinutes(), 59)
  assert.equal(to.getSeconds(), 59)
  assert.equal(to.getMilliseconds(), 999)
})

test('yesterday preset lands on the previous calendar day', () => {
  const { from, to } = computeDateRange('yesterday', null, NOW)
  assert.equal(from.getDate(), 12)
  assert.equal(to.getDate(), 12)
  assert.equal(to.getHours(), 23)
  assert.ok(inDateRange(new Date(2026, 7, 12, 23, 59, 59, 999), from, to))
  assert.ok(!inDateRange(new Date(2026, 7, 13, 0, 0, 0, 0), from, to))
})

test('yesterday handles month/year boundaries', () => {
  const mar1 = new Date(2026, 2, 1, 10, 0, 0, 0)
  const { from, to } = computeDateRange('yesterday', null, mar1)
  assert.equal(from.getMonth(), 1) // Feb (0-indexed)
  assert.equal(from.getDate(), 28)
  assert.equal(to.getMonth(), 1)
  assert.equal(to.getDate(), 28)
})

test('7d preset spans the previous 6 days plus today', () => {
  const { from, to } = computeDateRange('7d', null, NOW)
  assert.equal(from.getDate(), 7)
  assert.equal(to.getDate(), 13)
  assert.equal(to.getHours(), 23)
})

test('30d preset spans the previous 29 days plus today', () => {
  const { from, to } = computeDateRange('30d', null, NOW)
  assert.equal(from.getDate(), 15) // 13 - 29 = -16 → Jul 15
  assert.equal(from.getMonth(), 6) // July
  assert.equal(to.getDate(), 13)
})

test('this month preset starts on the first of the month', () => {
  const { from, to } = computeDateRange('month', null, NOW)
  assert.equal(from.getDate(), 1)
  assert.equal(from.getHours(), 0)
  assert.equal(to.getDate(), 13)
})

test('all preset returns no bounds', () => {
  assert.deepEqual(computeDateRange('all', null, NOW), { from: null, to: null })
  assert.deepEqual(computeDateRange(null, null, NOW), { from: null, to: null })
})

test('custom range includes the complete selected days', () => {
  const { from, to } = computeDateRange('custom', { start: '2026-08-01', end: '2026-08-13' }, NOW)
  assert.equal(from.getDate(), 1)
  assert.equal(from.getHours(), 0)
  assert.equal(to.getDate(), 13)
  assert.equal(to.getHours(), 23)
  assert.equal(to.getMilliseconds(), 999)
})

test('custom same-day range covers the whole day', () => {
  const { from, to } = computeDateRange('custom', { start: '2026-08-13', end: '2026-08-13' }, NOW)
  assert.equal(from.getTime(), startOfDay(new Date(2026, 7, 13)).getTime())
  assert.equal(to.getTime(), endOfDay(new Date(2026, 7, 13)).getTime())
  assert.ok(inDateRange(new Date(2026, 7, 13, 12, 0, 0, 0), from, to))
  assert.ok(!inDateRange(new Date(2026, 7, 12, 23, 59, 59, 999), from, to))
  assert.ok(!inDateRange(new Date(2026, 7, 14, 0, 0, 0, 0), from, to))
})

test('custom range across year boundary', () => {
  const { from, to } = computeDateRange('custom', { start: '2025-12-31', end: '2026-01-01' }, NOW)
  assert.equal(from.getFullYear(), 2025)
  assert.equal(from.getDate(), 31)
  assert.equal(to.getFullYear(), 2026)
  assert.equal(to.getDate(), 1)
  assert.ok(inDateRange(new Date(2026, 0, 1, 0, 30, 0, 0), from, to))
  assert.ok(inDateRange(new Date(2025, 11, 31, 23, 30, 0, 0), from, to))
  assert.ok(!inDateRange(new Date(2025, 11, 30, 23, 59, 59, 999), from, to))
})

test('reversed custom range yields no bounds', () => {
  assert.deepEqual(computeDateRange('custom', { start: '2026-08-13', end: '2026-08-01' }, NOW), {
    from: null,
    to: null,
  })
})

test('missing or unparseable custom dates yield no bounds', () => {
  assert.deepEqual(computeDateRange('custom', null, NOW), { from: null, to: null })
  assert.deepEqual(computeDateRange('custom', { start: '', end: '2026-08-01' }, NOW), { from: null, to: null })
  assert.deepEqual(computeDateRange('custom', { start: 'garbage', end: '2026-08-01' }, NOW), { from: null, to: null })
})

test('getReviewTimestampMs handles all supported shapes', () => {
  const iso = '2026-08-13T10:00:00.000Z'
  const ms = Date.parse(iso)
  assert.equal(getReviewTimestampMs(iso), ms)
  assert.equal(getReviewTimestampMs(new Date(ms)), ms)
  assert.equal(getReviewTimestampMs({ seconds: Math.floor(ms / 1000), nanoseconds: 0 }), ms)
  assert.equal(getReviewTimestampMs({ _seconds: Math.floor(ms / 1000), _nanoseconds: 0 }), ms)
  assert.equal(getReviewTimestampMs({ toDate: () => new Date(ms) }), ms)
  assert.equal(getReviewTimestampMs(ms), ms)
  assert.equal(getReviewTimestampMs(null), null)
  assert.equal(getReviewTimestampMs(undefined), null)
  assert.equal(getReviewTimestampMs('garbage'), null)
})

test('inDateRange includes exact boundary timestamps and excludes out-of-range', () => {
  const from = new Date(2026, 7, 13, 0, 0, 0, 0)
  const to = new Date(2026, 7, 13, 23, 59, 59, 999)
  assert.ok(inDateRange(from, from, to))
  assert.ok(inDateRange(to, from, to))
  assert.ok(!inDateRange(new Date(from.getTime() - 1), from, to))
  assert.ok(!inDateRange(new Date(to.getTime() + 1), from, to))
  assert.ok(!inDateRange(null, from, to))
})

test('inDateRange with no bounds includes everything', () => {
  assert.ok(inDateRange(null, null, null))
  assert.ok(inDateRange(new Date(), null, null))
})

test('formatRangeLabel renders clear labels', () => {
  assert.equal(formatRangeLabel(null, null), '')
  const from = new Date(2026, 7, 1)
  const to = new Date(2026, 7, 13)
  assert.match(formatRangeLabel(from, to), /Aug 1.*Aug 13, 2026/)
  assert.match(formatRangeLabel(from, null), /From Aug 1, 2026/)
  assert.match(formatRangeLabel(null, to), /Until Aug 13, 2026/)
})

test('toDateInputValue round-trips for date inputs', () => {
  assert.equal(toDateInputValue(new Date(2026, 0, 5)), '2026-01-05')
  assert.equal(toDateInputValue(new Date(2026, 7, 13)), '2026-08-13')
  assert.equal(parseDateInput('2026-08-13').getTime(), new Date(2026, 7, 13).getTime())
})