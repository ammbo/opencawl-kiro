import { useState, useEffect, useRef } from 'preact/hooks';
import { useAuth } from '../hooks/useAuth.jsx';
import { useApi } from '../hooks/useApi.js';
import { useToast } from '../components/Toast.jsx';

export default function Voice() {
  const { user } = useAuth();
  const { request } = useApi();
  const toast = useToast();
  const [voices, setVoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selecting, setSelecting] = useState(null);
  const [playingId, setPlayingId] = useState(null);
  const audioRef = useRef(null);

  useEffect(() => {
    request('/api/voice/library').then((data) => {
      if (data && data.voices) setVoices(data.voices);
      setLoading(false);
    });
  }, []);

  const handlePreview = (voice) => {
    if (playingId === voice.voice_id) {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      setPlayingId(null);
      return;
    }
    if (audioRef.current) { audioRef.current.pause(); }
    const audio = new Audio(voice.preview_url);
    audio.onended = () => setPlayingId(null);
    audio.play().catch(() => toast('Failed to play preview', 'error'));
    audioRef.current = audio;
    setPlayingId(voice.voice_id);
  };

  const handleSelect = async (voice) => {
    setSelecting(voice.voice_id);
    const res = await request('/api/voice/select', {
      method: 'POST',
      body: JSON.stringify({ voice_id: voice.voice_id, voice_name: voice.name }),
    });
    setSelecting(null);
    if (res) toast('Voice updated', 'success');
    else toast('Failed to update voice', 'error');
  };

  if (loading) {
    return (
      <div>
        <h1 class="page-title">Voice Library</h1>
        <div class="placeholder-page">Loading voices…</div>
      </div>
    );
  }

  return (
    <div>
      <h1 class="page-title">Voice Library</h1>
      {voices.length === 0 ? (
        <div class="placeholder-page">No voices available.</div>
      ) : (
        <div class="voice-grid">
          {voices.map((v) => {
            const isSelected = user?.voice_id === v.voice_id;
            return (
              <div key={v.voice_id} class={`voice-card${isSelected ? ' voice-card-selected' : ''}`}>
                <div class="voice-card-header">
                  <span class="voice-name">{v.name}</span>
                  {isSelected && <span class="voice-badge">Selected</span>}
                </div>
                {v.description && <p class="voice-desc">{v.description}</p>}
                <div class="voice-meta">
                  {v.gender && <span class="voice-tag">{v.gender}</span>}
                  {v.accent && <span class="voice-tag">{v.accent}</span>}
                </div>
                <div class="voice-actions">
                  {v.preview_url && (
                    <button class="btn btn-secondary" onClick={() => handlePreview(v)}>
                      {playingId === v.voice_id ? '⏹ Stop' : '▶ Preview'}
                    </button>
                  )}
                  <button
                    class="btn btn-primary"
                    onClick={() => handleSelect(v)}
                    disabled={isSelected || selecting === v.voice_id}
                  >
                    {selecting === v.voice_id ? 'Selecting…' : isSelected ? 'Selected' : 'Select'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
