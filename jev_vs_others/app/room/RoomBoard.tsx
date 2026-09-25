import type { CSSProperties } from 'react';
import { roomFloorChoices } from '../../lib/room-overlay';
import type { RoomDecision, RoomScenario, RoomState } from '../../lib/room';

export const tileNames: Record<string, string> = { '#': 'Wall', '.': 'Floor', S: 'Start', E: 'Exit', K: 'Key', P: 'Parcel', D: 'Locked door' };

export function RoomBoard({ scenario, state, decision, editing, busy, raised, showScores, paint }: {
  scenario: RoomScenario; state: RoomState | null; decision: RoomDecision | null | undefined;
  editing: boolean; busy: boolean; raised: boolean; showScores: boolean; paint: (x: number, y: number) => void;
}) {
  const overlays = !editing && showScores && state ? roomFloorChoices(scenario, state, decision) : [];
  return <div className={`room-scene ${raised && !editing ? 'room-raised' : ''}`}>
    <div className="room-grid" style={{ gridTemplateColumns: `repeat(${scenario.grid[0].length}, 1fr)`, aspectRatio: `${scenario.grid[0].length} / ${scenario.grid.length}` }} aria-label="Room grid">
      {scenario.grid.flatMap((row, y) => [...row].map((tile, x) => {
        const agent = !editing && state?.x === x && state.y === y;
        const collected = !editing && ((tile === 'K' && state?.hasKey) || (tile === 'P' && state?.hasParcel));
        const open = !editing && tile === 'D' && state?.doorOpen;
        const scores = overlays.filter(item => item.x === x && item.y === y);
        const strongest = Math.max(0, ...scores.map(item => item.score ?? 0));
        const image = !collected && (tile === 'K' ? 'key' : tile === 'P' ? 'parcel' : null);
        return <button key={`${x},${y}`} className={`room-cell ${tile === '#' ? 'room-wall' : ''} ${agent ? 'room-agent' : ''} ${tile === 'E' ? 'room-exit' : ''} ${scores.length ? 'room-scored' : ''} ${scores.length && (image || agent || tile === 'D') ? 'room-choice-with-object' : ''} ${scores.some(s => s.chosen) ? 'room-chosen' : ''}`}
          style={{ '--room-floor-color': `hsl(132 39% ${85 - strongest * 48}%)`, '--room-floor-ink': strongest > .5 ? '#fff' : '#153f28' } as CSSProperties}
          disabled={!editing || busy} onClick={() => paint(x, y)}
          title={scores.map(s => s.description).join('; ') || tileNames[tile]}
          aria-describedby={scores.length ? `room-score-${x}-${y}` : undefined}
          aria-label={`Cell ${x},${y}: ${tileNames[tile]}${open ? ', open' : ''}${collected ? ', collected' : ''}${agent ? ', agent' : ''}`}>
          {image && <img className={`room-object ${agent ? 'room-object-under-agent' : ''}`} src={`/room/${image}.png`} alt="" aria-hidden="true" draggable={false}/>}
          {tile === 'D' && <span className={`room-door ${open ? 'room-door-open' : ''}`} aria-hidden="true"><span>{open ? 'OPEN' : 'LOCKED'}</span></span>}
          {(tile === 'E' || tile === 'S') && <span className="room-floor-mark" aria-hidden="true">{tile === 'E' ? 'EXIT' : 'START'}</span>}
          {agent && <img className="room-object room-robot" src="/room/robot.png" alt="" aria-hidden="true" draggable={false}/>}
          {scores.length > 0 && <span className="room-floor-choices" id={`room-score-${x}-${y}`}>{scores.map(item => <span key={item.action} className={decision ? 'room-score-badge' : 'room-action-hint'} aria-label={item.description}>
            <span className={`room-floor-direction ${item.action.includes('_') ? 'room-floor-interaction' : ''}`} aria-hidden="true">{item.label}</span>
            <span className="room-floor-probability" aria-hidden="true">{item.percentage ?? 'Analyze'}</span>
          </span>)}</span>}
          <small>{x},{y}</small>
        </button>;
      }))}
    </div>
  </div>;
}
