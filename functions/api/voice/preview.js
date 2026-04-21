/**
 * GET /api/voice/preview
 * Returns the preview audio URL for a given ElevenLabs voice.
 * Query param: ?voice_id=xxx
 */
export async function onRequestGet(context) {
  const { ELEVENLABS_API_KEY } = context.env;
  const url = new URL(context.request.url);
  const voiceId = url.searchParams.get('voice_id');

  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  if (!voiceId) {
    return json(
      { error: { code: 'INVALID_INPUT', message: 'Missing required query parameter: voice_id' } },
      400,
    );
  }

  try {
    const res = await fetch(`https://api.elevenlabs.io/v1/voices/${voiceId}`, {
      headers: { 'xi-api-key': ELEVENLABS_API_KEY },
    });

    if (res.status === 404) {
      return json(
        { error: { code: 'NOT_FOUND', message: 'Voice not found' } },
        404,
      );
    }

    if (!res.ok) {
      return json(
        { error: { code: 'ELEVENLABS_ERROR', message: 'Failed to fetch voice details' } },
        500,
      );
    }

    const voice = await res.json();

    return json({ preview_url: voice.preview_url || null });
  } catch (err) {
    return json(
      { error: { code: 'INTERNAL_ERROR', message: 'Unable to reach ElevenLabs API' } },
      500,
    );
  }
}
