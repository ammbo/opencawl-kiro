export default function NotFound() {
  return (
    <div style={{ textAlign: 'center', padding: '80px 20px' }}>
      <h1 style={{ fontSize: '72px', margin: '0 0 8px', opacity: 0.3 }}>404</h1>
      <p style={{ fontSize: '18px', margin: '0 0 24px', opacity: 0.6 }}>Page not found</p>
      <a href="/dashboard/" class="btn btn-primary">Back to Dashboard</a>
    </div>
  );
}
