export default function LogStrip({ log }) {
  return (
    <div className="log-strip">
      {log.map((entry, i) => (
        <span key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {i > 0 && <span className="log-sep">│</span>}
          <span className="log-entry">
            {entry.ts && <span className="ts">{entry.ts}</span>}
            <span className={entry.ok ? 'ok' : 'err'}>{entry.ok ? '✓' : '✗'}</span>
            {entry.msg}
          </span>
        </span>
      ))}
    </div>
  )
}
