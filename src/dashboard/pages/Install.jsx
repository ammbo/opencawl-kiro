import { useState, useEffect } from 'preact/hooks';
import { useApi } from '../hooks/useApi.js';
import { useToast } from '../components/Toast.jsx';
import { CopyIcon, KeyIcon } from '../components/Icons.jsx';
import { formatKeyStatus, formatKeyPrefix, buildCopyToast, skillFileFallback, isGenerateDisabled, generateButtonLabel } from './install-utils.js';

export default function Install() {
  const { request } = useApi();
  const toast = useToast();

  // API Key state
  const [existingKeys, setExistingKeys] = useState([]);
  const [generatedKey, setGeneratedKey] = useState(null);
  const [loadingKeys, setLoadingKeys] = useState(true);
  const [generating, setGenerating] = useState(false);

  // Skill file state
  const [skillContent, setSkillContent] = useState(null);
  const [loadingSkill, setLoadingSkill] = useState(true);

  // Fetch existing keys and skill file on mount
  useEffect(() => {
    (async () => {
      const res = await request('/api/keys/list');
      if (res && res.keys) {
        setExistingKeys(res.keys);
      }
      setLoadingKeys(false);
    })();

    fetch('/opencawl.js')
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error('Failed to load'))))
      .then((text) => { setSkillContent(text); setLoadingSkill(false); })
      .catch(() => { setSkillContent(skillFileFallback()); setLoadingSkill(false); });
  }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    const res = await request('/api/keys/create', { method: 'POST' });
    if (res && res.key) {
      setGeneratedKey(res.key);
      // Refresh the keys list
      const updated = await request('/api/keys/list');
      if (updated && updated.keys) setExistingKeys(updated.keys);
    }
    setGenerating(false);
  };

  const copyText = async (text, label) => {
    let success = false;
    try {
      await window.navigator.clipboard.writeText(text);
      success = true;
    } catch {
      // clipboard write failed
    }
    const t = buildCopyToast(success, label);
    toast(t.message, t.type);
  };

  return (
    <div>
      <h1 class="page-title">Install / Connect Agent</h1>

      {/* Section 1: API Key Management */}
      <div class="card" style={{ maxWidth: 600, marginBottom: 24 }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 4 }}>API Key</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 16 }}>
          Generate a setup key to authenticate your OpenClaw agent.
        </p>

        {loadingKeys ? (
          <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Loading…</span>
        ) : (
          <>
            {/* Show existing keys */}
            {existingKeys.length > 0 && !generatedKey && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 6 }}>
                  Existing Keys
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {existingKeys.map((k) => (
                    <div
                      key={k.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 8,
                        background: 'var(--bg)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '6px 12px',
                        fontSize: '0.85rem',
                      }}
                    >
                      <KeyIcon width={14} height={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                      <span style={{ flex: 1 }}>{formatKeyPrefix(k)}</span>
                      <span style={{ color: k.is_active ? 'var(--success)' : 'var(--text-muted)', fontSize: '0.75rem' }}>
                        {formatKeyStatus(k)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Generated key display */}
            {generatedKey && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 6 }}>
                  Your New API Key
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <div
                    style={{
                      flex: 1,
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '8px 12px',
                      fontSize: '0.85rem',
                      wordBreak: 'break-all',
                      fontFamily: 'monospace',
                    }}
                  >
                    {generatedKey}
                  </div>
                  <button
                    class="btn btn-secondary"
                    style={{ padding: '6px 10px', flexShrink: 0 }}
                    onClick={() => copyText(generatedKey, 'API key')}
                    aria-label="Copy API key"
                  >
                    <CopyIcon width={16} height={16} />
                  </button>
                </div>
                <p style={{ color: 'var(--warning, var(--error))', fontSize: '0.8rem', margin: 0 }}>
                  ⚠ This key is only shown once and cannot be retrieved later. Copy it now.
                </p>
              </div>
            )}

            <button
              class="btn btn-primary"
              disabled={isGenerateDisabled(generating)}
              onClick={handleGenerate}
            >
              {generateButtonLabel(generating)}
            </button>
          </>
        )}
      </div>

      {/* Section 2: Skill File */}
      <div class="card" style={{ maxWidth: 600 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>Skill File</h2>
          {skillContent && (
            <button
              class="btn btn-secondary"
              style={{ padding: '4px 10px', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 4 }}
              onClick={() => copyText(skillContent, 'Skill file')}
            >
              <CopyIcon width={14} height={14} /> Copy
            </button>
          )}
        </div>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 16 }}>
          Add this skill file to your OpenClaw agent configuration.
        </p>

        {loadingSkill ? (
          <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Loading…</span>
        ) : (
          <pre
            style={{
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: 12,
              fontSize: '0.8rem',
              lineHeight: 1.5,
              maxHeight: 320,
              overflowY: 'auto',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all',
              margin: 0,
            }}
          >
            {skillContent}
          </pre>
        )}
      </div>
    </div>
  );
}
