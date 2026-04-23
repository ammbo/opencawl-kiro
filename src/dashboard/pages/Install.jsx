import { useState, useEffect } from 'preact/hooks';
import { useApi } from '../hooks/useApi.js';
import { useToast } from '../components/Toast.jsx';
import { CopyIcon, KeyIcon } from '../components/Icons.jsx';
import { formatKeyStatus, formatKeyPrefix, buildCopyToast, isGenerateDisabled, generateButtonLabel } from './install-utils.js';

export default function Install() {
  const { request } = useApi();
  const toast = useToast();

  // API Key state
  const [existingKeys, setExistingKeys] = useState([]);
  const [generatedKey, setGeneratedKey] = useState(null);
  const [loadingKeys, setLoadingKeys] = useState(true);
  const [generating, setGenerating] = useState(false);

  // Fetch existing keys on mount
  useEffect(() => {
    (async () => {
      const res = await request('/api/keys/list');
      if (res && res.keys) {
        setExistingKeys(res.keys);
      }
      setLoadingKeys(false);
    })();
  }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    const res = await request('/api/keys/create', { method: 'POST' });
    if (res && res.key) {
      setGeneratedKey(res.key);
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

  const installCommand = `curl -fsSL ${window.location.origin}/api/openclaw/install-skill | sh`;
  const envLine = 'OPENCAWL_API_KEY=your-key-here';

  return (
    <div>
      <h1 class="page-title">Install / Connect Agent</h1>

      {/* Section 1: Install Skill */}
      <div class="card" style={{ maxWidth: 640, marginBottom: 24 }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 4 }}>1. Install the Skill</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 16 }}>
          Run this command to install the OpenCawl skill into your OpenClaw instance.
        </p>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <code
            style={{
              flex: 1,
              background: 'var(--bg)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              padding: '10px 12px',
              fontSize: '0.85rem',
              fontFamily: 'monospace',
              wordBreak: 'break-all',
              lineHeight: 1.4,
            }}
          >
            {installCommand}
          </code>
          <button
            class="btn btn-secondary"
            style={{ padding: '6px 10px', flexShrink: 0 }}
            onClick={() => copyText(installCommand, 'Install command')}
            aria-label="Copy install command"
          >
            <CopyIcon width={16} height={16} />
          </button>
        </div>

        <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', margin: 0 }}>
          This installs the SKILL.md and CLI script into your OpenClaw skills directory.
        </p>

        <details style={{ marginTop: 16 }}>
          <summary style={{ cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            Install manually
          </summary>
          <div style={{ marginTop: 12, fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
            <p style={{ margin: '0 0 8px' }}>
              Download these two files into your OpenClaw skills directory:
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
              {[
                { label: 'SKILL.md', path: '/opencawl/SKILL.md' },
                { label: 'scripts/opencawl.mjs', path: '/opencawl/scripts/opencawl.mjs' },
              ].map((file) => (
                <div key={file.path} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <code
                    style={{
                      flex: 1,
                      background: 'var(--bg)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      padding: '6px 10px',
                      fontSize: '0.8rem',
                      fontFamily: 'monospace',
                      wordBreak: 'break-all',
                    }}
                  >
                    {file.label}
                  </code>
                  <a
                    href={file.path}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="btn btn-secondary"
                    style={{ padding: '4px 10px', fontSize: '0.8rem', textDecoration: 'none', flexShrink: 0 }}
                  >
                    View
                  </a>
                  <button
                    class="btn btn-secondary"
                    style={{ padding: '4px 10px', flexShrink: 0 }}
                    onClick={() => copyText(`${window.location.origin}${file.path}`, file.label)}
                    aria-label={`Copy ${file.label} URL`}
                  >
                    <CopyIcon width={14} height={14} />
                  </button>
                </div>
              ))}
            </div>
            <p style={{ margin: 0 }}>
              Place them in <code style={{ fontSize: '0.8rem' }}>~/.openclaw/workspace/skills/opencawl/</code>
            </p>
          </div>
        </details>
      </div>

      {/* Section 2: API Key */}
      <div class="card" style={{ maxWidth: 640, marginBottom: 24 }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 4 }}>2. API Key</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 16 }}>
          Generate an API key, then add it to your OpenClaw environment.
        </p>

        {loadingKeys ? (
          <span style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>Loading…</span>
        ) : (
          <>
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
                  ⚠ This key is only shown once. Copy it now.
                </p>
              </div>
            )}

            <button
              class="btn btn-primary"
              disabled={isGenerateDisabled(generating)}
              onClick={handleGenerate}
              style={{ marginBottom: 16 }}
            >
              {generateButtonLabel(generating)}
            </button>

            <div>
              <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 6 }}>
                Then add this line on its own line in <code style={{ fontSize: '0.85rem' }}>~/.openclaw/.env</code>:
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <code
                  style={{
                    flex: 1,
                    background: 'var(--bg)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '10px 12px',
                    fontSize: '0.85rem',
                    fontFamily: 'monospace',
                    wordBreak: 'break-all',
                  }}
                >
                  {envLine}
                </code>
                <button
                  class="btn btn-secondary"
                  style={{ padding: '6px 10px', flexShrink: 0 }}
                  onClick={() => copyText(envLine, 'Env line')}
                  aria-label="Copy env line"
                >
                  <CopyIcon width={16} height={16} />
                </button>
              </div>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: 6, margin: '6px 0 0' }}>
                Replace <code style={{ fontSize: '0.8rem' }}>your-key-here</code> with the key above. If the line already exists, replace it — don't duplicate it.
              </p>
            </div>
          </>
        )}
      </div>

      {/* Section 3: Done */}
      <div class="card" style={{ maxWidth: 640 }}>
        <h2 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 4 }}>3. Done</h2>
        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: 12 }}>
          Your Claw now has a phone number. It can:
        </p>
        <ul style={{ color: 'var(--text-muted)', fontSize: '0.85rem', paddingLeft: 20, margin: 0 }}>
          <li style={{ marginBottom: 4 }}>Make outbound AI phone calls on your behalf</li>
          <li style={{ marginBottom: 4 }}>Pick up transcripts from calls you make to your OpenCawl number</li>
          <li style={{ marginBottom: 4 }}>Take action on your voice instructions and report back</li>
        </ul>
      </div>
    </div>
  );
}
