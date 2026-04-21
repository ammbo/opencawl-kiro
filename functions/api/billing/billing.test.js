import { describe, it, expect, vi, beforeEach } from 'vitest';
import { onRequestPost as checkout } from './checkout.js';
import { onRequestPost as portal } from './portal.js';
import { onRequestGet as usage } from './usage.js';

const originalFetch = globalThis.fetch;

function createContext({ method = 'POST', body = null, user = null, url = 'https://example.com/api/billing/test' } = {}) {
  const init = { method, headers: { 'Content-Type': 'application/json' } };
  if (body !== null) {
    init.body = JSON.stringify(body);
  }
  const request = new Request(url, init);

  const dbUpdates = [];
  const context = {
    request,
    env: {
      STRIPE_SECRET_KEY: 'sk_test_123',
      STRIPE_PRICE_STARTER: 'price_starter_monthly',
      STRIPE_PRICE_PRO: 'price_pro_monthly',
      DB: {
        prepare(sql) {
          return {
            bind(...args) {
              return {
                async run() {
                  dbUpdates.push({ sql, args });
                  return { success: true };
                },
                async all() {
                  return { results: [] };
                },
              };
            },
          };
        },
      },
    },
    data: {},
    _dbUpdates: dbUpdates,
  };

  if (user) {
    context.data.user = user;
  }

  return context;
}

const defaultUser = {
  id: 'user-123',
  phone: '+15551234567',
  plan: 'free',
  credits_balance: 250,
  voice_id: null,
  stripe_customer_id: null,
};

describe('POST /api/billing/checkout', () => {
  beforeEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns 400 for invalid JSON body', async () => {
    const ctx = createContext({ user: defaultUser });
    ctx.request = new Request('https://example.com/api/billing/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    const res = await checkout(ctx);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe('INVALID_INPUT');
  });

  it('returns 400 for missing plan', async () => {
    const ctx = createContext({ body: {}, user: defaultUser });
    const res = await checkout(ctx);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.message).toContain('starter');
  });

  it('returns 400 for invalid plan name', async () => {
    const ctx = createContext({ body: { plan: 'enterprise' }, user: defaultUser });
    const res = await checkout(ctx);
    expect(res.status).toBe(400);
  });

  it('creates Stripe customer when user has no stripe_customer_id', async () => {
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 'cus_new123' }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ url: 'https://checkout.stripe.com/session123' }), { status: 200 }),
      );

    const ctx = createContext({ body: { plan: 'starter' }, user: { ...defaultUser } });
    const res = await checkout(ctx);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.checkout_url).toBe('https://checkout.stripe.com/session123');

    // Should have called Stripe twice: create customer + create session
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    const [customerUrl] = globalThis.fetch.mock.calls[0];
    expect(customerUrl).toBe('https://api.stripe.com/v1/customers');

    // Should have persisted stripe_customer_id
    expect(ctx._dbUpdates.length).toBe(1);
    expect(ctx._dbUpdates[0].sql).toContain('UPDATE users SET stripe_customer_id');
  });

  it('skips customer creation when user already has stripe_customer_id', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ url: 'https://checkout.stripe.com/session456' }), { status: 200 }),
    );

    const userWithStripe = { ...defaultUser, stripe_customer_id: 'cus_existing' };
    const ctx = createContext({ body: { plan: 'pro' }, user: userWithStripe });
    const res = await checkout(ctx);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.checkout_url).toBe('https://checkout.stripe.com/session456');

    // Only one Stripe call (checkout session), no customer creation
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [sessionUrl, sessionOpts] = globalThis.fetch.mock.calls[0];
    expect(sessionUrl).toBe('https://api.stripe.com/v1/checkout/sessions');
    expect(sessionOpts.headers['Authorization']).toBe('Bearer sk_test_123');
    expect(sessionOpts.headers['Content-Type']).toBe('application/x-www-form-urlencoded');

    // Verify correct price ID for pro plan
    expect(sessionOpts.body).toContain('price_pro_monthly');
  });

  it('returns 500 when Stripe customer creation fails', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: 'Invalid' } }), { status: 400 }),
    );

    const ctx = createContext({ body: { plan: 'starter' }, user: { ...defaultUser } });
    const res = await checkout(ctx);
    expect(res.status).toBe(500);
  });

  it('returns 500 when Stripe checkout session creation fails', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ url: 'https://checkout.stripe.com/fail' }), { status: 400 }),
    );

    const userWithStripe = { ...defaultUser, stripe_customer_id: 'cus_existing' };
    const ctx = createContext({ body: { plan: 'starter' }, user: userWithStripe });
    const res = await checkout(ctx);
    expect(res.status).toBe(500);
  });

  it('uses correct price ID for starter plan', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ url: 'https://checkout.stripe.com/s' }), { status: 200 }),
    );

    const userWithStripe = { ...defaultUser, stripe_customer_id: 'cus_existing' };
    const ctx = createContext({ body: { plan: 'starter' }, user: userWithStripe });
    await checkout(ctx);

    const [, opts] = globalThis.fetch.mock.calls[0];
    expect(opts.body).toContain('price_starter_monthly');
  });
});

describe('POST /api/billing/portal', () => {
  beforeEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns 400 when user has no stripe_customer_id', async () => {
    const ctx = createContext({ user: { ...defaultUser } });
    const res = await portal(ctx);
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error.code).toBe('INVALID_INPUT');
  });

  it('returns portal URL on success', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ url: 'https://billing.stripe.com/portal123' }), { status: 200 }),
    );

    const userWithStripe = { ...defaultUser, stripe_customer_id: 'cus_abc' };
    const ctx = createContext({ user: userWithStripe });
    const res = await portal(ctx);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.portal_url).toBe('https://billing.stripe.com/portal123');

    // Verify Stripe API call
    const [url, opts] = globalThis.fetch.mock.calls[0];
    expect(url).toBe('https://api.stripe.com/v1/billing_portal/sessions');
    expect(opts.headers['Authorization']).toBe('Bearer sk_test_123');
    expect(opts.body).toContain('cus_abc');
  });

  it('returns 500 when Stripe portal creation fails', async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify({ error: { message: 'fail' } }), { status: 400 }),
    );

    const userWithStripe = { ...defaultUser, stripe_customer_id: 'cus_abc' };
    const ctx = createContext({ user: userWithStripe });
    const res = await portal(ctx);
    expect(res.status).toBe(500);
  });

  it('returns 500 when fetch throws', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const userWithStripe = { ...defaultUser, stripe_customer_id: 'cus_abc' };
    const ctx = createContext({ user: userWithStripe });
    const res = await portal(ctx);
    expect(res.status).toBe(500);
  });
});

describe('GET /api/billing/usage', () => {
  it('returns usage data for current billing period', async () => {
    const transactions = [
      { amount: -12, operation_type: 'call', created_at: '2024-01-15T10:00:00Z' },
      { amount: -2, operation_type: 'sms', created_at: '2024-01-15T11:00:00Z' },
      { amount: -24, operation_type: 'call', created_at: '2024-01-16T09:00:00Z' },
    ];

    const ctx = createContext({ method: 'GET', user: defaultUser });
    ctx.env.DB.prepare = (sql) => ({
      bind(...args) {
        return {
          async all() {
            if (sql.includes('credit_transactions')) return { results: transactions };
            return { results: [] };
          },
          async first() {
            return { count: 0 };
          },
        };
      },
    });

    const res = await usage(ctx);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.usage).toBeInstanceOf(Array);
    expect(data.usage.length).toBe(2);
    expect(data.usage[0].date).toBe('2024-01-15');
    expect(data.usage[0].total).toBe(14);
    expect(data.usage[1].date).toBe('2024-01-16');
    expect(data.usage[1].total).toBe(24);
    expect(data.calls_today).toBe(0);
    expect(data.recent_calls).toEqual([]);
  });

  it('returns empty usage when no transactions exist', async () => {
    const ctx = createContext({ method: 'GET', user: defaultUser });
    ctx.env.DB.prepare = (sql) => ({
      bind(...args) {
        return {
          async all() { return { results: [] }; },
          async first() { return { count: 0 }; },
        };
      },
    });
    const res = await usage(ctx);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.usage).toEqual([]);
  });

  it('returns 500 when DB query fails', async () => {
    const ctx = createContext({ method: 'GET', user: defaultUser });
    ctx.env.DB.prepare = () => ({
      bind() {
        return {
          async all() {
            throw new Error('DB error');
          },
          async first() {
            throw new Error('DB error');
          },
        };
      },
    });

    const res = await usage(ctx);
    expect(res.status).toBe(500);
    const data = await res.json();
    expect(data.error.code).toBe('INTERNAL_ERROR');
  });
});
