import type { LearningSeries } from '../../lib/series';
import type { LearningContext } from '../../lib/learning';

export function LearningProgress({ series }: { series: LearningSeries | null }) {
  if (!series) return null;
  return <section className="panel learning-progress" aria-label="Learning series progress">
    <h2>Learning series · {series.learner.toUpperCase()} vs {series.opponent.toUpperCase()}</h2>
    <p role="status">{series.games.length} / {series.target} games finished · {series.status}{series.status !== 'complete' ? ` · Game ${series.games.length + 1}, ply ${series.current.moves.length}` : ''}</p>
    <p>Memory includes every earlier game in this series. Deficit is the opponent’s material minus the learner’s, with a minimum of zero. It does not determine the game result.</p>
    {series.games.map(({ review }) => <details key={review.game}>
      <summary>Game {review.game} · {review.learner_color === 'w' ? 'White' : 'Black'} · {review.result} · deficit {review.material.deficit} points</summary>
      <p>{review.reason} · {review.plies} plies. Material: learner {review.material.own}, opponent {review.material.opponent}. Balance change from start: {review.material.balance_change}.</p>
      <ul>{review.lessons.map(lesson => <li key={lesson}>{lesson}</li>)}</ul>
      {review.costly_exchanges.map(exchange => <p key={exchange.ply}>Review ply {exchange.ply}: {exchange.move} → {exchange.reply}; material change {exchange.material_change}. Later compensation may exist.</p>)}
    </details>)}
    <p>Session memory is lost on refresh. Export Decision JSON to save games, reports and settings.</p>
  </section>;
}

export function LearningMemory({ learning }: { learning?: LearningContext }) {
  if (!learning) return null;
  return <details className="model-context learning-memory"><summary>Learning memory supplied · {learning.previous_games.length} earlier games</summary>
    <p>Game {learning.game_number}. These reports were supplied to the learner; this does not prove improvement or change model weights.</p>
    {learning.previous_games.map(report => <p key={report.game}>Game {report.game}: {report.result}, deficit {report.material.deficit}. {report.lessons.join(' ')}</p>)}
  </details>;
}
