import { useState, useEffect } from 'preact/hooks';
import { useApi } from '../hooks/useApi.js';

export default function VoiceSelector({ value, onChange, id }) {
  const { request } = useApi();
  const [voices, setVoices] = useState([]);

  useEffect(() => {
    request('/api/voice/library').then((data) => {
      if (data && data.voices) setVoices(data.voices);
    });
  }, []);

  return (
    <select
      id={id}
      class="form-input"
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">Default</option>
      {voices.map((v) => (
        <option key={v.voice_id} value={v.voice_id}>
          {v.name}
        </option>
      ))}
    </select>
  );
}
