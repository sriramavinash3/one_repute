/**
 * tests/reviews.service.spec.ts
 *
 * Unit tests for ReviewsService.getReviews: chronological sorting,
 * date-range filtering, date boundaries, and pagination.
 */

import { ReviewsService } from '../src/modules/reviews/reviews.service';
import { validateActiveOutlet } from '../src/common/utils/outlet-validator';

jest.mock('../src/common/utils/outlet-validator', () => ({
  validateActiveOutlet: jest.fn().mockResolvedValue({ id: 'outlet_1', status: 'active' }),
}));

const TEST_DB_URL = 'postgresql://test:test@localhost:5432/test';

function makePrismaMock() {
  return {
    review: {
      findMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
  };
}

function mockFirestoreDb(docs: Array<{ id: string; data: () => any }>) {
  const reviewsQuery = {
    where: () => ({ get: jest.fn().mockResolvedValue({ docs }) }),
    get: jest.fn().mockResolvedValue({ docs }),
  };
  return {
    collection: (name: string) => {
      if (name === 'reviews') return reviewsQuery;
      if (name === 'outlets') return { get: jest.fn().mockResolvedValue({ docs: [] }) };
      return { doc: () => ({ get: jest.fn() }) };
    },
  };
}

function doc(id: string, reviewTimestamp: Date, extra: any = {}) {
  return { id, data: () => ({ reviewTimestamp, status: 'pending', ...extra }) };
}

describe('ReviewsService.getReviews — Prisma path', () => {
  let service: ReviewsService;
  let prisma: ReturnType<typeof makePrismaMock>;
  let firestoreDb: any;

  beforeEach(() => {
    process.env.DATABASE_URL = TEST_DB_URL;
    prisma = makePrismaMock();
    firestoreDb = { getDb: jest.fn() };
    service = new ReviewsService(firestoreDb, prisma as any);
  });

  afterEach(() => {
    delete process.env.DATABASE_URL;
    jest.clearAllMocks();
  });

  it('sorts by reviewTimestamp DESC with a stable id DESC secondary sort by default', async () => {
    prisma.review.findMany.mockResolvedValue([
      { id: 'r2', reviewTimestamp: new Date('2026-08-13T10:00:00.000Z'), status: 'responded' },
      { id: 'r1', reviewTimestamp: new Date('2026-08-12T10:00:00.000Z'), status: 'pending' },
    ]);
    prisma.review.count.mockResolvedValue(2);
    prisma.review.groupBy.mockResolvedValue([
      { status: 'responded', _count: { _all: 1 } },
      { status: 'pending', _count: { _all: 1 } },
    ]);

    const result = await service.getReviews({ outletId: 'outlet_1', page: 1, limit: 10 });

    expect(prisma.review.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ reviewTimestamp: 'desc' }, { id: 'desc' }],
        skip: 0,
        take: 10,
      }),
    );
    expect(result.data.map((r: any) => r.id)).toEqual(['r2', 'r1']);
    expect(result.pagination).toEqual({ total: 2, page: 1, limit: 10, totalPages: 1 });
    expect(result.data[0].status).toBe('responded');
    expect(result.data[0].requiresManualReply).toBe(false);
  });

  it('supports date_asc sort with ascending id tiebreak', async () => {
    prisma.review.findMany.mockResolvedValue([]);
    prisma.review.count.mockResolvedValue(0);
    prisma.review.groupBy.mockResolvedValue([]);

    await service.getReviews({ outletId: 'outlet_1', sort: 'date_asc', page: 1, limit: 10 });

    expect(prisma.review.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: [{ reviewTimestamp: 'asc' }, { id: 'asc' }],
      }),
    );
  });

  it('filters by ISO datetime range from/to against reviewTimestamp', async () => {
    prisma.review.findMany.mockResolvedValue([]);
    prisma.review.count.mockResolvedValue(0);
    prisma.review.groupBy.mockResolvedValue([]);

    await service.getReviews({
      outletId: 'outlet_1',
      from: '2026-08-01T00:00:00.000Z',
      to: '2026-08-13T23:59:59.999Z',
      page: 1,
      limit: 10,
    });

    const where = prisma.review.findMany.mock.calls[0][0].where;
    expect(where.reviewTimestamp.gte.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(where.reviewTimestamp.lte.toISOString()).toBe('2026-08-13T23:59:59.999Z');
  });

  it('treats bare YYYY-MM-DD boundaries as complete UTC days (from=midnight, to=end-of-day)', async () => {
    prisma.review.findMany.mockResolvedValue([]);
    prisma.review.count.mockResolvedValue(0);
    prisma.review.groupBy.mockResolvedValue([]);

    await service.getReviews({ outletId: 'outlet_1', from: '2026-08-01', to: '2026-08-13', page: 1, limit: 10 });

    const where = prisma.review.findMany.mock.calls[0][0].where;
    expect(where.reviewTimestamp.gte.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(where.reviewTimestamp.lte.toISOString()).toBe('2026-08-13T23:59:59.999Z');
  });

  it('covers the full day for a same-day custom range', async () => {
    prisma.review.findMany.mockResolvedValue([]);
    prisma.review.count.mockResolvedValue(0);
    prisma.review.groupBy.mockResolvedValue([]);

    await service.getReviews({ outletId: 'outlet_1', from: '2026-08-13', to: '2026-08-13', page: 1, limit: 10 });

    const where = prisma.review.findMany.mock.calls[0][0].where;
    expect(where.reviewTimestamp.gte.toISOString()).toBe('2026-08-13T00:00:00.000Z');
    expect(where.reviewTimestamp.lte.toISOString()).toBe('2026-08-13T23:59:59.999Z');
  });

  it('returns an empty result for a reversed date range without querying', async () => {
    const result = await service.getReviews({ outletId: 'outlet_1', from: '2026-08-13', to: '2026-08-01', page: 1, limit: 10 });

    expect(result.data).toEqual([]);
    expect(result.pagination.total).toBe(0);
    expect(result.pagination.totalPages).toBe(0);
    expect(prisma.review.findMany).not.toHaveBeenCalled();
    expect(prisma.review.count).not.toHaveBeenCalled();
  });

  it('returns an empty result for invalid date values without querying', async () => {
    const result = await service.getReviews({ outletId: 'outlet_1', from: 'not-a-date', to: '2026-08-13', page: 1, limit: 10 });

    expect(result.data).toEqual([]);
    expect(result.pagination.total).toBe(0);
    expect(prisma.review.findMany).not.toHaveBeenCalled();
  });

  it('paginates correctly while a date filter is applied', async () => {
    prisma.review.findMany.mockResolvedValue([]);
    prisma.review.count.mockResolvedValue(25);
    prisma.review.groupBy.mockResolvedValue([]);

    const result = await service.getReviews({
      outletId: 'outlet_1',
      from: '2026-07-01',
      to: '2026-07-31',
      page: 2,
      limit: 10,
    });

    expect(prisma.review.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 10, take: 10 }),
    );
    expect(prisma.review.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ reviewTimestamp: expect.any(Object) }),
      }),
    );
    expect(result.pagination).toEqual({ total: 25, page: 2, limit: 10, totalPages: 3 });
  });

  it('computes status counts within the applied date range', async () => {
    prisma.review.findMany.mockResolvedValue([]);
    prisma.review.count.mockResolvedValue(6);
    prisma.review.groupBy.mockResolvedValue([
      { status: 'pending', _count: { _all: 2 } },
      { status: 'suggested', _count: { _all: 3 } },
      { status: 'responded', _count: { _all: 1 } },
    ]);

    const result = await service.getReviews({ outletId: 'outlet_1', from: '2026-08-01', to: '2026-08-13', page: 1, limit: 10 });

    const countsWhere = prisma.review.groupBy.mock.calls[0][0].where;
    expect(countsWhere.outletId).toBe('outlet_1');
    expect(countsWhere.reviewTimestamp.gte.toISOString()).toBe('2026-08-01T00:00:00.000Z');

    expect(result.counts).toEqual({ all: 6, pending: 2, suggested: 3, responded: 1, escalated: 0, failed: 0 });
  });
});

describe('ReviewsService.getReviews — Firestore fallback path', () => {
  let service: ReviewsService;
  let firestoreDb: any;

  beforeEach(() => {
    delete process.env.DATABASE_URL;
    firestoreDb = { getDb: jest.fn() };
    service = new ReviewsService(firestoreDb, {} as any);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('filters by date range and preserves DESC chronological order', async () => {
    firestoreDb.getDb.mockReturnValue(
      mockFirestoreDb([
        doc('r1', new Date('2026-08-10T10:00:00.000Z')),
        doc('r2', new Date('2026-08-13T12:00:00.000Z')),
        doc('r3', new Date('2026-08-14T12:00:00.000Z')),
      ]),
    );

    const result = await service.getReviews({ outletId: 'outlet_1', from: '2026-08-11', to: '2026-08-13', page: 1, limit: 10 });

    expect(result.data.map((r: any) => r.id)).toEqual(['r2']);
    expect(result.pagination.total).toBe(1);
  });

  it('sorts DESC with id DESC tiebreak for identical timestamps', async () => {
    firestoreDb.getDb.mockReturnValue(
      mockFirestoreDb([
        doc('a1', new Date('2026-08-13T10:00:00.000Z')),
        doc('b1', new Date('2026-08-12T10:00:00.000Z')),
        doc('a2', new Date('2026-08-13T10:00:00.000Z')),
      ]),
    );

    const result = await service.getReviews({ outletId: 'outlet_1', page: 1, limit: 10 });

    expect(result.data.map((r: any) => r.id)).toEqual(['a2', 'a1', 'b1']);
  });

  it('supports date_asc ordering (oldest first)', async () => {
    firestoreDb.getDb.mockReturnValue(
      mockFirestoreDb([
        doc('a1', new Date('2026-08-13T10:00:00.000Z')),
        doc('a2', new Date('2026-08-12T10:00:00.000Z')),
      ]),
    );

    const result = await service.getReviews({ outletId: 'outlet_1', sort: 'date_asc', page: 1, limit: 10 });

    expect(result.data.map((r: any) => r.id)).toEqual(['a2', 'a1']);
  });

  it('paginates the filtered set without gaps or duplicates', async () => {
    const docs = [1, 2, 3, 4, 5].map((n) =>
      doc(`r${n}`, new Date(`2026-08-0${n}T10:00:00.000Z`)),
    );
    firestoreDb.getDb.mockReturnValue(mockFirestoreDb(docs));

    const page1 = await service.getReviews({ outletId: 'outlet_1', page: 1, limit: 2 });
    const page2 = await service.getReviews({ outletId: 'outlet_1', page: 2, limit: 2 });
    const page3 = await service.getReviews({ outletId: 'outlet_1', page: 3, limit: 2 });

    expect(page1.data.map((r: any) => r.id)).toEqual(['r5', 'r4']);
    expect(page2.data.map((r: any) => r.id)).toEqual(['r3', 'r2']);
    expect(page3.data.map((r: any) => r.id)).toEqual(['r1']);
    expect(page1.pagination).toEqual({ total: 5, page: 1, limit: 2, totalPages: 3 });
    expect(page2.pagination).toEqual({ total: 5, page: 2, limit: 2, totalPages: 3 });
    expect(page3.pagination).toEqual({ total: 5, page: 3, limit: 2, totalPages: 3 });
    expect(new Set([...page1.data, ...page2.data, ...page3.data].map((r: any) => r.id)).size).toBe(5);
  });

  it('returns an empty result for a reversed date range', async () => {
    firestoreDb.getDb.mockReturnValue(mockFirestoreDb([doc('r1', new Date('2026-08-13T10:00:00.000Z'))]));

    const result = await service.getReviews({ outletId: 'outlet_1', from: '2026-08-13', to: '2026-08-01', page: 1, limit: 10 });

    expect(result.data).toEqual([]);
    expect(result.pagination.total).toBe(0);
  });

  it('handles year/month boundary ranges (Dec 31 → Jan 1)', async () => {
    firestoreDb.getDb.mockReturnValue(
      mockFirestoreDb([
        doc('r1', new Date('2025-12-30T10:00:00.000Z')),
        doc('r2', new Date('2025-12-31T23:30:00.000Z')),
        doc('r3', new Date('2026-01-01T01:00:00.000Z')),
        doc('r4', new Date('2026-01-02T10:00:00.000Z')),
      ]),
    );

    const result = await service.getReviews({ outletId: 'outlet_1', from: '2025-12-31', to: '2026-01-01', page: 1, limit: 10 });

    expect(result.data.map((r: any) => r.id)).toEqual(['r3', 'r2']);
  });

  it('returns zero results when no reviews exist in the selected range', async () => {
    firestoreDb.getDb.mockReturnValue(
      mockFirestoreDb([doc('r1', new Date('2026-08-01T10:00:00.000Z'))]),
    );

    const result = await service.getReviews({ outletId: 'outlet_1', from: '2026-09-01', to: '2026-09-30', page: 1, limit: 10 });

    expect(result.data).toEqual([]);
    expect(result.counts.all).toBe(0);
  });
});

describe('ReviewsService.getReviewCount', () => {
  let service: ReviewsService;
  let prisma: ReturnType<typeof makePrismaMock>;
  let firestoreDb: any;
  const authUser = { uid: 'u1', email: 'owner@bistro.com', role: 'outlet', customerId: 'cust_1' };

  beforeEach(() => {
    prisma = makePrismaMock();
    firestoreDb = { getDb: jest.fn() };
    service = new ReviewsService(firestoreDb, prisma as any);
    firestoreDb.getDb.mockReturnValue({});
    (validateActiveOutlet as jest.Mock).mockResolvedValue({ id: 'outlet_1', status: 'active' });
  });

  afterEach(() => {
    delete process.env.DATABASE_URL;
    jest.clearAllMocks();
  });

  it('returns the exact database COUNT for the outlet (Prisma path, no row fetch)', async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    prisma.review.count.mockResolvedValue(42);

    const result = await service.getReviewCount('outlet_1', authUser);

    expect(result).toEqual({ outletId: 'outlet_1', totalReviews: 42, total: 42 });
    expect(prisma.review.findMany).not.toHaveBeenCalled();
    expect(prisma.review.count).toHaveBeenCalledWith({ where: { outletId: 'outlet_1' } });
  });

  it('returns 0 for an outlet with no reviews', async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    prisma.review.count.mockResolvedValue(0);

    const result = await service.getReviewCount('outlet_1', authUser);

    expect(result.totalReviews).toBe(0);
    expect(result.total).toBe(0);
  });

  it('returns the exact database COUNT via Firestore aggregate when Prisma is unavailable', async () => {
    delete process.env.DATABASE_URL;
    const reviewsQuery = {
      where: () => ({
        count: () => ({
          get: jest.fn().mockResolvedValue({ data: () => ({ count: 7 }) }),
        }),
      }),
    };
    firestoreDb.getDb.mockReturnValue({ collection: (name: string) => (name === 'reviews' ? reviewsQuery : {}) });

    const result = await service.getReviewCount('outlet_1', authUser);

    expect(result).toEqual({ outletId: 'outlet_1', totalReviews: 7, total: 7 });
  });

  it('enforces outlet ownership against the authenticated user', async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    prisma.review.count.mockResolvedValue(42);

    await service.getReviewCount('outlet_1', authUser);

    expect(validateActiveOutlet).toHaveBeenCalledWith(expect.anything(), 'outlet_1', authUser);
  });

  it('rejects when the outlet belongs to another customer scope', async () => {
    process.env.DATABASE_URL = TEST_DB_URL;
    (validateActiveOutlet as jest.Mock).mockRejectedValueOnce(new Error('Access denied to outlet_1'));

    await expect(service.getReviewCount('outlet_1', authUser)).rejects.toThrow('Access denied to outlet_1');
    expect(prisma.review.count).not.toHaveBeenCalled();
  });

  it('returns zero (never a global count) when no outletId is provided', async () => {
    process.env.DATABASE_URL = TEST_DB_URL;

    const result = await service.getReviewCount(undefined, authUser);

    expect(result).toEqual({ outletId: null, totalReviews: 0, total: 0 });
    expect(prisma.review.count).not.toHaveBeenCalled();
  });
});