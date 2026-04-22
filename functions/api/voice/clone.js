/**
 * POST /api/voice/clone
 * Clones a custom voice via the ElevenLabs API.
 * Restricted to Pro_Plan users only — returns 403 for others.
 */
export async function onRequestPost(context) {
  const user = context.data.user;
  const { ELEVENLABS_API_KEY } = context.env;

  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  // Paid plan gate — both starter and pro can clone
  if (user.plan === 'free') {
    return json(
      { error: { code: 'FORBIDDEN', message: 'Voice cloning requires a paid plan' } },
      403,
    );
  }

  let body;
  try {
    body = await context.request.json();
  } catch {
    return json(
      { error: { code: 'INVALID_INPUT', message: 'Invalid JSON body' } },
      400,
    );
  }

  const { name, audio_url } = body;

  if (!name || typeof name !== 'string') {
    return json(
      { error: { code: 'INVALID_INPUT', message: 'Missing or invalid voice name' } },
      400,
    );
  }

  if (!audio_url || typeof audio_url !== 'string') {
    return json(
      { error: { code: 'INVALID_INPUT', message: 'Missing or invalid audio_url' } },
      400,
    );
  }

  try {
    // Fetch the audio file from the provided URL
    const audioRes = await fetch(audio_url);
    if (!audioRes.ok) {
      return json(
        { error: { code: 'INVALID_INPUT', message: 'Unable to fetch audio from provided URL' } },
        400,
      );
    }

    const audioBlob = await audioRes.blob();

    // Build multipart form data for ElevenLabs voice cloning API
    const formData = new FormData();
    formData.append('name', name);
    formData.append('files', audioBlob, 'voice_sample.mp3');

    const res = await fetch('https://api.elevenlabs.io/v1/voices/add', {
      method: 'POST',
      headers: { 'xi-api-key': ELEVENLABS_API_KEY },
      body: formData,
    });

    if (!res.ok) {
      return json(
        { error: { code: 'ELEVENLABS_ERROR', message: 'Failed to clone voice' } },
        500,
      );
    }

    const data = await res.json();

    return json({ voice_id: data.voice_id });
  } catch (err) {
    return json(
      { error: { code: 'INTERNAL_ERROR', message: 'Unable to reach ElevenLabs API' } },
      500,
    );
  }
}
