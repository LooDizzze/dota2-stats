interface StatCardProps {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  wide?: boolean;
}

export default function StatCard({ label, value, sub, color, wide }: StatCardProps) {
  return (
    <div
      className="card"
      style={{
        padding: '16px 20px',
        minWidth: wide ? '160px' : '120px',
        flex: 1,
      }}
    >
      <div
        style={{
          fontSize: '11px',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: 'var(--color-muted)',
          marginBottom: '8px',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: '26px',
          fontWeight: 700,
          color: color || 'var(--color-text)',
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: '12px', color: 'var(--color-muted)', marginTop: '4px' }}>
          {sub}
        </div>
      )}
    </div>
  );
}
