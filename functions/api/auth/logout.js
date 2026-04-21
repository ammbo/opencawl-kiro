/**
 * POST /api/auth/logout
 * Invalidates the session and clears the session cookie.
 */
export async function onRequestPost(context) {
  const { request, env } = context;

  // Parse session cookie
  const cookieHeader = request.headers.get('Cookie') || '';
  let sessionToken = null;

  for (const pair of cookieHeader.split(';')) {
    const [name, ...rest] = pair.trim().split('=');
    if (name && name.trim() === 'session') {
      sessionToken = rest.join('=').trim();
      break;
    }
  }

  if (sessionToken) {
    // Hash the token and delete the session from D1
    try {
      const tokenHashBuffer = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(sessionToken),
      );
      const tokenHash = Array.from(new Uint8Array(tokenHashBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');

      await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?')
        .bind(tokenHash)
        .run();
    } catch (err) {
      console.error('Error deleting session:', err);
    }
  }

  // Clear cookie regardless
  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Set-Cookie': 'session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0',
    },
  });
}
