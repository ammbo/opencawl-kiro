import { verifyJWT } from './lib/jwt.js';
import { hashApiKey } from './lib/api-keys.js';

/**
 * Public routes that require no authentication.
 */
const PUBLIC_PATHS = [
  '/api/auth/send-code',
  '/api/auth/verify-code',
];

/**
 * Returns a JSON error response with consistent format.
 */
function errorResponse(status, code, message) {
  return new Response(JSON.stringify({ error: { code, message } }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Parses cookies from the Cookie header string.
 */
function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  for (const pair of cookieHeader.split(';')) {
    const [name, ...rest] = pair.trim().split('=');
    if (name) cookies[name.trim()] = rest.join('=').trim();
  }
  return cookies;
}

export const onRequest = [
  async (context) => {
    const url = new URL(context.request.url);
    const path = url.pathname;

    // Non-API paths (static assets) — pass through.
    // For /dashboard/* sub-routes, rewrite to /dashboard/index.html so the
    // SPA client-side router handles them on hard refresh / direct navigation.
    if (!path.startsWith('/api/')) {
      if (
        path.startsWith('/dashboard/') &&
        path !== '/dashboard/' &&
        path !== '/dashboard/index.html' &&
        !path.match(/\.\w+$/) // skip actual file requests (e.g. .js, .css)
      ) {
        const spaUrl = new URL('/dashboard/index.html', url.origin);
        return context.env.ASSETS.fetch(new Request(spaUrl, context.request));
      }
      return context.next();
    }

    // Public routes — no auth required
    if (PUBLIC_PATHS.includes(path) || path.startsWith('/api/webhooks/')) {
      return context.next();
    }

    // OpenClaw API routes — dual auth: Bearer token first, then session cookie fallback
    // Exception: install-skill is public (the skill itself is public; API key is configured after install)
    if (path.startsWith('/api/openclaw/')) {
      if (path === '/api/openclaw/install-skill') {
        return context.next();
      }
      // Try Bearer token auth first
      const authHeader = context.request.headers.get('Authorization') || '';
      const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);

      if (bearerMatch) {
        const token = bearerMatch[1];
        const keyHash = await hashApiKey(token);

        const row = await context.env.DB.prepare(
          'SELECT api_keys.*, users.* FROM api_keys JOIN users ON api_keys.user_id = users.id WHERE api_keys.key_hash = ? AND api_keys.is_active = 1',
        )
          .bind(keyHash)
          .first();

        if (row) {
          context.data.user = {
            id: row.user_id,
            phone: row.phone,
            plan: row.plan,
            credits_balance: row.credits_balance,
            voice_id: row.voice_id,
            twilio_phone_number: row.twilio_phone_number,
            is_admin: row.is_admin,
            stripe_customer_id: row.stripe_customer_id,
          };
          return context.next();
        }

        // Invalid Bearer token — don't fall back, return 401
        return errorResponse(401, 'UNAUTHORIZED', 'Invalid or revoked API key');
      }

      // Fall back to session cookie auth
      const cookieHeader = context.request.headers.get('Cookie');
      const cookies = parseCookies(cookieHeader);
      const sessionToken = cookies.session;

      if (!sessionToken) {
        return errorResponse(401, 'UNAUTHORIZED', 'Missing authentication');
      }

      const payload = await verifyJWT(sessionToken, context.env.JWT_SECRET);
      if (!payload) {
        return errorResponse(401, 'UNAUTHORIZED', 'Invalid or expired session');
      }

      const user = await context.env.DB.prepare('SELECT * FROM users WHERE id = ?')
        .bind(payload.sub)
        .first();

      if (!user) {
        return errorResponse(401, 'UNAUTHORIZED', 'User not found');
      }

      context.data.user = user;
      return context.next();
    }

    // All other /api/* routes — JWT session cookie auth
    const cookieHeader = context.request.headers.get('Cookie');
    const cookies = parseCookies(cookieHeader);
    const sessionToken = cookies.session;

    if (!sessionToken) {
      return errorResponse(401, 'UNAUTHORIZED', 'Missing session cookie');
    }

    const payload = await verifyJWT(sessionToken, context.env.JWT_SECRET);
    if (!payload) {
      return errorResponse(401, 'UNAUTHORIZED', 'Invalid or expired session');
    }

    const user = await context.env.DB.prepare('SELECT * FROM users WHERE id = ?')
      .bind(payload.sub)
      .first();

    if (!user) {
      return errorResponse(401, 'UNAUTHORIZED', 'User not found');
    }

    context.data.user = user;

    // Admin routes — additional is_admin check
    if (path.startsWith('/api/admin/')) {
      const adminPhones = (context.env.ADMIN_PHONE_NUMBERS || '').split(',').map((p) => p.trim());
      const isAdmin = context.data.user.is_admin === 1 || adminPhones.includes(context.data.user.phone);
      if (!isAdmin) {
        return errorResponse(403, 'FORBIDDEN', 'Admin access required');
      }
    }

    return context.next();
  },
];
