export default function LoadingSpinner({ text = 'Loading...' }: { text?: string }) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '60px 20px',
        gap: '16px',
        color: 'var(--color-muted)',
      }}
    >
      <div
        style={{
          width: '36px',
          height: '36px',
          border: '3px solid var(--color-border)',
          borderTopColor: 'var(--color-gold)',
          borderRadius: '50%',
          animation: 'spin 0.8s linear infinite',
        }}
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <span style={{ fontSize: '14px' }}>{text}</span>
    </div>
  );
}

export function ErrorMessage({ message }: { message: string }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
        color: 'var(--color-red-bright)',
        fontSize: '14px',
        gap: '8px',
      }}
    >
      <span>Error: {message}</span>
    </div>
  );
}
