import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { onRequestGet, onRequestPost, onRequestDelete } from './accepted-numbers.js';

// ─── Test helpers ───

/**
 * In-memory store simulating the accepted_numbers table.
 * Supports INSERT (with UNIQUE constraint), SELECT, and DELETE.
 */
function createInMemoryStore() {
  const rows = [];

  return {
    rows,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async run() {
              if (sql.startsWith('INSERT')) {
                const [id, userId, phoneNumber, label, createdAt] = args;
                // Enforce UNIQUE(user_id, phone_number)
                const dup = rows.find(
                  (r) => r.user_id === userId && r.phone_number === phoneNumber,
                );
                if (dup) {
                  throw new Error('UNIQUE constraint failed: accepted_numbers.user_id, accepted_numbers.phone_number');
                }
                rows.push({ id, user_id: userId, phone_number: phoneNumber, label, created_at: createdAt });
                return { success: true, meta: { changes: 1 } };
              }
              if (sql.startsWith('DELETE')) {
                const userId = args[0];
                const phoneNumbers = args.slice(1);
                let removed = 0;
                for (let i = rows.length - 1; i >= 0; i--) {
                  if (rows[i].user_id === userId && phoneNumbers.includes(rows[i].phone_number)) {
                    rows.splice(i, 1);
                    removed++;
                  }
                }
                return { success: true, meta: { changes: removed } };
              }
              return { success: true, meta: { changes: 0 } };
            },
            async all() {
              if (sql.startsWith('SELECT')) {
                const userId = args[0];
                const results = rows
                  .filter((r) => r.user_id === userId)
                  .map(({ phone_number, label, created_at }) => ({ phone_number, label, created_at }));
                return { results };
              }
              return { results: [] };
            },
          };
        },
      };
    },
  };
}

function createContext({ user, method = 'GET', body = null, store = null } = {}) {
  const db = store || createInMemoryStore();

  const init = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== null) {
    init.body = JSON.stringify(body);
  }

  return {
    request: new Request('https://example.com/api/phone/accepted-numbers', init),
    data: { user },
    env: { DB: db },
    _db: db,
  };
}

function withRequest(ctx, method, body = null) {
  const init = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== null) init.body = JSON.stringify(body);
  return {
    ...ctx,
    request: new Request('https://example.com/api/phone/accepted-numbers', init),
  };
}

const PAID_USER = { id: 'user-paid-1', plan: 'pro' };
const FREE_USER = { id: 'user-free-1', plan: 'free' };

// ─── Arbitrary generators ───

/** Generates a valid E.164 phone number: + followed by 1-15 digits, first digit 1-9 */
const arbE164 = fc
  .tuple(
    fc.integer({ min: 1, max: 9 }),
    fc.stringOf(fc.constantFrom('0','1','2','3','4','5','6','7','8','9'), { minLength: 0, maxLength: 14 }),
  )
  .map(([first, rest]) => `+${first}${rest}`);

/** Generates a unique set of valid E.164 numbers (1-10) */
const arbE164Set = fc
  .uniqueArray(arbE164, { minLength: 1, maxLength: 10, comparator: (a, b) => a === b });

/** Generates an optional label string */
const arbLabel = fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: undefined });

// ─── Property 8: Accepted numbers CRUD round-trip ───

/**
 * Property 8: Accepted numbers CRUD round-trip
 * **Validates: Requirements 5.1, 5.2, 5.3**
 *
 * For any set of valid E.164 phone numbers with optional labels added via POST,
 * GET returns all added numbers with their labels and creation timestamps.
 * After removing a subset via DELETE, GET returns only the remaining numbers.
 */
describe('Property 8: Accepted numbers CRUD round-trip', () => {
  it('POST then GET returns all added numbers with labels and timestamps', async () => {
    await fc.assert(
      fc.asyncProperty(arbE164Set, async (phoneNumbers) => {
        const store = createInMemoryStore();
        const numbers = phoneNumbers.map((pn) => ({ phone_number: pn, label: `label-${pn}` }));

        // POST
        const postCtx = createContext({ user: PAID_USER, method: 'POST', body: { numbers }, store });
        const postRes = await onRequestPost(postCtx);
        expect(postRes.status).toBe(200);
        const postData = await postRes.json();
        expect(postData.success).toBe(true);
        expect(postData.added).toBe(phoneNumbers.length);

        // GET
        const getCtx = withRequest({ ...postCtx, _db: store, env: { DB: store } }, 'GET');
        getCtx.data = { user: PAID_USER };
        const getRes = await onRequestGet(getCtx);
        expect(getRes.status).toBe(200);
        const getData = await getRes.json();

        expect(getData.numbers).toHaveLength(phoneNumbers.length);
        const returnedPhones = getData.numbers.map((n) => n.phone_number).sort();
        expect(returnedPhones).toEqual([...phoneNumbers].sort());

        // Verify labels and timestamps
        for (const num of getData.numbers) {
          expect(num.label).toBe(`label-${num.phone_number}`);
          expect(num.created_at).toBeTruthy();
        }
      }),
      { numRuns: 100 },
    );
  });

  it('after DELETE of a subset, GET returns only remaining numbers', async () => {
    await fc.assert(
      fc.asyncProperty(
        arbE164Set.filter((arr) => arr.length >= 2),
        async (phoneNumbers) => {
          const store = createInMemoryStore();
          const numbers = phoneNumbers.map((pn) => ({ phone_number: pn }));

          // POST all
          const postCtx = createContext({ user: PAID_USER, method: 'POST', body: { numbers }, store });
          await onRequestPost(postCtx);

          // DELETE first half
          const toRemove = phoneNumbers.slice(0, Math.floor(phoneNumbers.length / 2));
          const remaining = phoneNumbers.slice(Math.floor(phoneNumbers.length / 2));

          const delCtx = createContext({ user: PAID_USER, method: 'DELETE', body: { phone_numbers: toRemove }, store });
          const delRes = await onRequestDelete(delCtx);
          expect(delRes.status).toBe(200);
          const delData = await delRes.json();
          expect(delData.success).toBe(true);
          expect(delData.removed).toBe(toRemove.length);

          // GET remaining
          const getCtx = createContext({ user: PAID_USER, method: 'GET', store });
          const getRes = await onRequestGet(getCtx);
          const getData = await getRes.json();

          const returnedPhones = getData.numbers.map((n) => n.phone_number).sort();
          expect(returnedPhones).toEqual([...remaining].sort());
        },
      ),
      { numRuns: 100 },
    );
  });
});

// ─── Property 9: E.164 validation on accepted numbers ───

/**
 * Property 9: E.164 validation on accepted numbers
 * **Validates: Requirements 5.4**
 *
 * For any phone number string that does not conform to E.164 format,
 * POST rejects it with 400 INVALID_INPUT.
 */
describe('Property 9: E.164 validation on accepted numbers', () => {
  /** Generates strings that are NOT valid E.164 */
  const arbInvalidPhone = fc.oneof(
    // No leading +
    fc.stringOf(fc.constantFrom('0','1','2','3','4','5','6','7','8','9'), { minLength: 1, maxLength: 15 }),
    // + followed by 0 (invalid first digit)
    fc.stringOf(fc.constantFrom('0','1','2','3','4','5','6','7','8','9'), { minLength: 1, maxLength: 14 })
      .map((rest) => `+0${rest}`),
    // Too many digits (>15)
    fc.stringOf(fc.constantFrom('0','1','2','3','4','5','6','7','8','9'), { minLength: 16, maxLength: 25 })
      .map((digits) => `+${digits}`),
    // Contains letters
    fc.tuple(
      fc.integer({ min: 1, max: 9 }),
      fc.stringOf(fc.constantFrom('a','b','c','0','1','2'), { minLength: 1, maxLength: 10 }),
    ).filter(([_, rest]) => /[a-c]/.test(rest))
      .map(([first, rest]) => `+${first}${rest}`),
    // Empty string
    fc.constant(''),
    // Just a plus sign
    fc.constant('+'),
    // Contains spaces
    fc.constant('+1 234 567 8901'),
    // Contains dashes
    fc.constant('+1-234-567-8901'),
  );

  it('rejects any non-E.164 phone number with 400 INVALID_INPUT', async () => {
    await fc.assert(
      fc.asyncProperty(arbInvalidPhone, async (invalidPhone) => {
        const store = createInMemoryStore();
        const ctx = createContext({
          user: PAID_USER,
          method: 'POST',
          body: { numbers: [{ phone_number: invalidPhone }] },
          store,
        });
        const res = await onRequestPost(ctx);
        expect(res.status).toBe(400);
        const data = await res.json();
        expect(data.error.code).toBe('INVALID_INPUT');
      }),
      { numRuns: 100 },
    );
  });
});

// ─── Unit tests for accepted numbers endpoints ───

describe('Accepted numbers unit tests', () => {
  // ─── Req 5.5: Free user gets 403 ───

  describe('free user gets 403 FORBIDDEN', () => {
    it('GET returns 403 for free user', async () => {
      const ctx = createContext({ user: FREE_USER, method: 'GET' });
      const res = await onRequestGet(ctx);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error.code).toBe('FORBIDDEN');
      expect(data.error.message).toBe('This feature requires a paid plan');
    });

    it('POST returns 403 for free user', async () => {
      const ctx = createContext({
        user: FREE_USER,
        method: 'POST',
        body: { numbers: [{ phone_number: '+14155551234' }] },
      });
      const res = await onRequestPost(ctx);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error.code).toBe('FORBIDDEN');
      expect(data.error.message).toBe('This feature requires a paid plan');
    });

    it('DELETE returns 403 for free user', async () => {
      const ctx = createContext({
        user: FREE_USER,
        method: 'DELETE',
        body: { phone_numbers: ['+14155551234'] },
      });
      const res = await onRequestDelete(ctx);
      expect(res.status).toBe(403);
      const data = await res.json();
      expect(data.error.code).toBe('FORBIDDEN');
      expect(data.error.message).toBe('This feature requires a paid plan');
    });
  });

  // ─── Duplicate number handling via UNIQUE constraint ───

  describe('duplicate number handling', () => {
    it('POST handles duplicate numbers gracefully (skips duplicates)', async () => {
      const store = createInMemoryStore();

      // Add a number first
      const ctx1 = createContext({
        user: PAID_USER,
        method: 'POST',
        body: { numbers: [{ phone_number: '+14155551234', label: 'First' }] },
        store,
      });
      const res1 = await onRequestPost(ctx1);
      expect(res1.status).toBe(200);
      const data1 = await res1.json();
      expect(data1.added).toBe(1);

      // Try to add the same number again
      const ctx2 = createContext({
        user: PAID_USER,
        method: 'POST',
        body: { numbers: [{ phone_number: '+14155551234', label: 'Duplicate' }] },
        store,
      });
      const res2 = await onRequestPost(ctx2);
      expect(res2.status).toBe(200);
      const data2 = await res2.json();
      expect(data2.added).toBe(0); // Duplicate skipped

      // Verify only one entry exists
      const getCtx = createContext({ user: PAID_USER, method: 'GET', store });
      const getRes = await onRequestGet(getCtx);
      const getData = await getRes.json();
      expect(getData.numbers).toHaveLength(1);
      expect(getData.numbers[0].label).toBe('First'); // Original label preserved
    });

    it('POST with mix of new and duplicate numbers adds only new ones', async () => {
      const store = createInMemoryStore();

      // Add initial number
      const ctx1 = createContext({
        user: PAID_USER,
        method: 'POST',
        body: { numbers: [{ phone_number: '+14155551234' }] },
        store,
      });
      await onRequestPost(ctx1);

      // Add mix of new and duplicate
      const ctx2 = createContext({
        user: PAID_USER,
        method: 'POST',
        body: {
          numbers: [
            { phone_number: '+14155551234' }, // duplicate
            { phone_number: '+442071234567' }, // new
          ],
        },
        store,
      });
      const res2 = await onRequestPost(ctx2);
      expect(res2.status).toBe(200);
      const data2 = await res2.json();
      expect(data2.added).toBe(1); // Only the new one

      // Verify total count
      const getCtx = createContext({ user: PAID_USER, method: 'GET', store });
      const getRes = await onRequestGet(getCtx);
      const getData = await getRes.json();
      expect(getData.numbers).toHaveLength(2);
    });
  });
});
