import type { ChessReferences } from '../../lib/retrieval';

export function BookReferences({ references }: { references?: ChessReferences }) {
  if (!references) return null;
  return <details className="model-context book-references">
    <summary>Book references supplied · {references.enabled ? references.entries.length : 'off'}</summary>
    <p>{references.enabled ? 'These references were sent to the model. They do not prove the model followed them or that a historical move is best.' : 'Book retrieval was disabled for this decision.'}</p>
    {references.enabled && !references.entries.length && <p>No matching references in this library.</p>}
    {references.entries.map(entry => <article key={entry.id}>
      <h3>{entry.title}</h3>
      <p><strong>{entry.match === 'exact_position' ? 'Exact position match' : 'General study note'}</strong> · {entry.reason}</p>
      <p>{entry.text}</p>
      {entry.continuation && <p>Historical continuation, starting with the current side to move: <code>{entry.continuation.map(m => `${m.san} (${m.uci})`).join(' → ')}</code></p>}
      <p><a href={entry.source.url} target="_blank" rel="noreferrer">{entry.source.author} · {entry.source.book}</a> · {entry.source.section}</p>
    </article>)}
    <p>Library: {references.library_version}. Retrieved material is also saved in Decision JSON.</p>
  </details>;
}
