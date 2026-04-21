import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onRequestPost } from './stripe.js';

const WEBHOOK_SECRET = 'whsec_test_secret';

/**
 * Compute a valid Stripe signature header for a given payload.
 */
async function signPayload(payload, secret = WEBHOOK_SECRET) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signedPayload = `${timestamp}.${payload}`;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(signedPayload));
  const bytes = new Uint8Array(sig);
  let hex = '';
  for (let i = 0; i < bytes.length; i++) hex += bytes[i].toString(16).padStart(2, '0');
  return `t=${timestamp},v1=${hex}`;
}

/**
 * Build a Stripe event payload.
 */
function makeEvent(type, dataObject, id = 'evt_test_123') {
  return JSON.stringify({ id, type, data: { object: dataObject } });
}

/**
 * Create a mock D1 database.
 */
function createMockDB() {
  const updates = [];
  const batchResults = [];
  const users = {};

  const db = {
    _updates: updates,
    _users: users,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            async run() {
              updates.push({ sql, args });
              return { success: true, meta: { changes: 1 } };
            },
            async first() {
              // Look up user by stripe_customer_id
              if (sql.includes('WHERE stripe_customer_id')) {
                const customerId = args[args.length - 1];
                return users[customerId] || null;
              }
              // Look up credits_balance
              if (sql.includes('SELECT credits_balance')) {
                const userId = args[0];
                for (const u of Object.values(users)) {
                  if (u.id === userId) return { credits_balance: u.credits_balance || 0 };
                }
                return { credits_balance: 0 };
              }
              return null;
            },
            async all() {
              return { results: [] };
            },
          };
        },
      };
    },
    async batch(stmts) {
      const results = [];
      for (const stmt of stmts) {
        const result = await stmt.run();
        results.push(result);
      }
      return results;
    },
  };

  return db;
}

/**
 * Create a request context for the webhook handler.
 */
function createContext(body, signatureHeader, db) {
  const request = new Request('https://example.com/api/webhooks/stripe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(signatureHeader ? { 'Stripe-Signature': signatureHeader } : {}),
    },
    body,
  });

  return {
    request,
    env: {
      STRIPE_WEBHOOK_SECRET: WEBHOOK_SECRET,
      STRIPE_PRICE_STARTER: 'price_starter_monthly',
      STRIPE_PRICE_PRO: 'price_pro_monthly',
      STRIPE_PRICE_OVERAGE: 'price_overage_per_min',
      DB: db || createMockDB(),
    },
    data: {},
  };
}

describe('POST /api/webhooks/stripe', () => {
  it('returns 401 when Stripe-Signature header is missing', async () => {
    const body = makeEvent('checkout.session.completed', { customer: 'cus_123' });
    const ctx = createContext(body, null, createMockDB());
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error.code).toBe('UNAUTHORIZED');
  });

  it('returns 401 when signature is invalid', async () => {
    const body = makeEvent('checkout.session.completed', { customer: 'cus_123' });
    const ctx = createContext(body, 't=123,v1=invalidsig', createMockDB());
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error.message).toContain('Invalid');
  });

  it('returns 200 for valid signature with unhandled event type', async () => {
    const body = makeEvent('payment_intent.succeeded', { id: 'pi_123' });
    const sig = await signPayload(body);
    const ctx = createContext(body, sig, createMockDB());
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.received).toBe(true);
  });

  it('returns 200 even when event structure is missing data.object', async () => {
    const body = JSON.stringify({ id: 'evt_123', type: 'some.event' });
    const sig = await signPayload(body);
    const ctx = createContext(body, sig, createMockDB());
    const res = await onRequestPost(ctx);
    expect(res.status).toBe(200);
  });

  describe('checkout.session.completed', () => {
    it('upgrades user plan for starter plan', async () => {
      const db = createMockDB();
      db._users['cus_abc'] = { id: 'user-1', phone: '+15551234567', plan: 'free', credits_balance: 250, stripe_customer_id: 'cus_abc' };

      const session = {
        id: 'cs_test_session',
        customer: 'cus_abc',
        subscription: 'sub_123',
        line_items: {
          data: [{ price: { id: 'price_starter_monthly' } }],
        },
      };
      const body = makeEvent('checkout.session.completed', session);
      const sig = await signPayload(body);
      const ctx = createContext(body, sig, db);

      const res = await onRequestPost(ctx);
      expect(res.status).toBe(200);

      // Should have updated plan and subscription ID
      const planUpdate = db._updates.find(u => u.sql.includes('UPDATE users SET plan'));
      expect(planUpdate).toBeTruthy();
      expect(planUpdate.args[0]).toBe('starter');
    });

    it('upgrades user plan for pro plan', async () => {
      const db = createMockDB();
      db._users['cus_pro'] = { id: 'user-2', phone: '+15559876543', plan: 'free', credits_balance: 250, stripe_customer_id: 'cus_pro' };

      const session = {
        id: 'cs_pro_session',
        customer: 'cus_pro',
        subscription: 'sub_456',
        line_items: {
          data: [{ price: { id: 'price_pro_monthly' } }],
        },
      };
      const body = makeEvent('checkout.session.completed', session);
      const sig = await signPayload(body);
      const ctx = createContext(body, sig, db);

      const res = await onRequestPost(ctx);
      expect(res.status).toBe(200);

      const planUpdate = db._updates.find(u => u.sql.includes('UPDATE users SET plan'));
      expect(planUpdate).toBeTruthy();
      expect(planUpdate.args[0]).toBe('pro');
    });

    it('handles missing customer gracefully and returns 200', async () => {
      const db = createMockDB();
      const session = { id: 'cs_no_customer' };
      const body = makeEvent('checkout.session.completed', session);
      const sig = await signPayload(body);
      const ctx = createContext(body, sig, db);

      const res = await onRequestPost(ctx);
      expect(res.status).toBe(200);
      // No plan updates should have occurred
      const planUpdate = db._updates.find(u => u.sql.includes('UPDATE users SET plan'));
      expect(planUpdate).toBeUndefined();
    });

    it('handles unknown user gracefully and returns 200', async () => {
      const db = createMockDB();
      const session = {
        id: 'cs_unknown',
        customer: 'cus_nonexistent',
        line_items: { data: [{ price: { id: 'price_starter_monthly' } }] },
      };
      const body = makeEvent('checkout.session.completed', session);
      const sig = await signPayload(body);
      const ctx = createContext(body, sig, db);

      const res = await onRequestPost(ctx);
      expect(res.status).toBe(200);
    });
  });

  describe('customer.subscription.updated', () => {
    it('updates user plan based on subscription items', async () => {
      const db = createMockDB();
      db._users['cus_sub'] = { id: 'user-4', phone: '+15552223333', plan: 'starter', credits_balance: 1200, stripe_customer_id: 'cus_sub' };

      const subscription = {
        customer: 'cus_sub',
        status: 'active',
        items: { data: [{ price: { id: 'price_pro_monthly' } }] },
      };
      const body = makeEvent('customer.subscription.updated', subscription);
      const sig = await signPayload(body);
      const ctx = createContext(body, sig, db);

      const res = await onRequestPost(ctx);
      expect(res.status).toBe(200);

      const planUpdate = db._updates.find(u => u.sql.includes('UPDATE users SET plan'));
      expect(planUpdate).toBeTruthy();
      expect(planUpdate.args[0]).toBe('pro');
    });

    it('downgrades to free when subscription status is canceled', async () => {
      const db = createMockDB();
      db._users['cus_cancel'] = { id: 'user-5', phone: '+15554445555', plan: 'pro', credits_balance: 4200, stripe_customer_id: 'cus_cancel' };

      const subscription = {
        customer: 'cus_cancel',
        status: 'canceled',
        items: { data: [{ price: { id: 'price_pro_monthly' } }] },
      };
      const body = makeEvent('customer.subscription.updated', subscription);
      const sig = await signPayload(body);
      const ctx = createContext(body, sig, db);

      const res = await onRequestPost(ctx);
      expect(res.status).toBe(200);

      const planUpdate = db._updates.find(u => u.sql.includes('UPDATE users SET plan'));
      expect(planUpdate).toBeTruthy();
      expect(planUpdate.args[0]).toBe('free');
    });

    it('downgrades to free when subscription status is unpaid', async () => {
      const db = createMockDB();
      db._users['cus_unpaid'] = { id: 'user-6', phone: '+15556667777', plan: 'starter', credits_balance: 100, stripe_customer_id: 'cus_unpaid' };

      const subscription = {
        customer: 'cus_unpaid',
        status: 'unpaid',
        items: { data: [{ price: { id: 'price_starter_monthly' } }] },
      };
      const body = makeEvent('customer.subscription.updated', subscription);
      const sig = await signPayload(body);
      const ctx = createContext(body, sig, db);

      const res = await onRequestPost(ctx);
      expect(res.status).toBe(200);

      const planUpdate = db._updates.find(u => u.sql.includes('UPDATE users SET plan'));
      expect(planUpdate).toBeTruthy();
      expect(planUpdate.args[0]).toBe('free');
    });
  });

  describe('customer.subscription.deleted', () => {
    it('downgrades user to free tier', async () => {
      const db = createMockDB();
      const subscription = { customer: 'cus_del' };
      const body = makeEvent('customer.subscription.deleted', subscription);
      const sig = await signPayload(body);
      const ctx = createContext(body, sig, db);

      const res = await onRequestPost(ctx);
      expect(res.status).toBe(200);

      const planUpdate = db._updates.find(u => u.sql.includes("plan = 'free'"));
      expect(planUpdate).toBeTruthy();
    });

    it('handles missing customer gracefully', async () => {
      const db = createMockDB();
      const subscription = {};
      const body = makeEvent('customer.subscription.deleted', subscription);
      const sig = await signPayload(body);
      const ctx = createContext(body, sig, db);

      const res = await onRequestPost(ctx);
      expect(res.status).toBe(200);
      // No updates should have occurred
      expect(db._updates.length).toBe(0);
    });
  });

  describe('error handling', () => {
    it('returns 200 even when DB throws an error', async () => {
      const db = createMockDB();
      db._users['cus_err'] = { id: 'user-err', phone: '+15550000000', plan: 'free', credits_balance: 250, stripe_customer_id: 'cus_err' };

      // Override prepare to throw on plan update
      const origPrepare = db.prepare.bind(db);
      db.prepare = (sql) => {
        if (sql.includes('UPDATE users SET plan')) {
          return {
            bind() {
              return {
                async run() { throw new Error('DB write failed'); },
              };
            },
          };
        }
        return origPrepare(sql);
      };

      const session = {
        id: 'cs_err',
        customer: 'cus_err',
        line_items: { data: [{ price: { id: 'price_starter_monthly' } }] },
      };
      const body = makeEvent('checkout.session.completed', session);
      const sig = await signPayload(body);
      const ctx = createContext(body, sig, db);

      const res = await onRequestPost(ctx);
      // Should still return 200 to prevent Stripe retry storms
      expect(res.status).toBe(200);
    });
  });
});
