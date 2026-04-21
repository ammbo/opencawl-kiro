/**
 * GET /api/voice/library
 * Returns 20 curated ElevenLabs voices with metadata.
 */

// Curated set of 20 ElevenLabs voice IDs
const CURATED_VOICE_IDS = [
  'EXAVITQu4vr4xnSDxMaL', // Sarah
  'IKne3meq5aSn9XLyUdCD', // Charlie
  'JBFqnCBsd6RMkjVDRZzb', // George
  'N2lVS1w4EtoT3dr4eOWO', // Callum
  'TX3LPaxmHKxFdv7VOQHJ', // Liam
  'XB0fDUnXU5powFXDhCwa', // Charlotte
  'Xb7hH8MSUJpSbSDYk0k2', // Alice
  'XrExE9yKIg1WjnnlVkGX', // Matilda
  'bIHbv24MWmeRgasZH58o', // Will
  'cgSgspJ2msm6clMCkdW9', // Jessica
  'cjVigY5qzO86Huf0OWal', // Eric
  'iP95p4xoKVk53GoZ742B', // Chris
  'nPczCjzI2devNBz1zQrb', // Brian
  'onwK4e9ZLuTAKqWW03F9', // Daniel
  'pFZP5JQG7iQjIQuC4Bku', // Lily
  'pqHfZKP75CvOlQylNhV4', // Bill
  'SAz9YHcvj6GT2YYXdXww', // River
  'ThT5KcBeYPX3keUQqHPh', // Dorothy
  'TxGEqnHWrfWFTfGW9XjX', // Josh
  'ZQe5CZNOzWyzPSCn5a3c', // James
];

export async function onRequestGet(context) {
  const { ELEVENLABS_API_KEY } = context.env;

  const json = (body, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });

  try {
    const res = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': ELEVENLABS_API_KEY },
    });

    if (!res.ok) {
      return json(
        { error: { code: 'ELEVENLABS_ERROR', message: 'Failed to fetch voice library' } },
        500,
      );
    }

    const data = await res.json();
    const allVoices = data.voices || [];

    // Filter to curated set, fall back to first 20 if no matches
    let filtered = allVoices.filter((v) => CURATED_VOICE_IDS.includes(v.voice_id));
    if (filtered.length === 0) {
      filtered = allVoices.slice(0, 20);
    }

    const voices = filtered.map((v) => ({
      voice_id: v.voice_id,
      name: v.name,
      description: v.description || null,
      gender: (v.labels && v.labels.gender) || null,
      accent: (v.labels && v.labels.accent) || null,
      preview_url: v.preview_url || null,
    }));

    return json({ voices });
  } catch (err) {
    return json(
      { error: { code: 'INTERNAL_ERROR', message: 'Unable to reach ElevenLabs API' } },
      500,
    );
  }
}
