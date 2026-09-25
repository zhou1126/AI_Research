import type { Decision, Engine, Position } from './chess';
import type { GameReview, Learner, LearningGame } from './learning';
export type SeriesEntry = { position: Position; decision: Decision; san: string };
export type SeriesSettings = { iterations: number; depth: number; seed: number; limit: number; ragEnabled: boolean };
export type LearningSeries = {
  id: string; target: number; learner: Learner; opponent: Engine; firstColor: 'w' | 'b'; initialFen: string;
  settings: SeriesSettings; status: 'running' | 'paused' | 'complete';
  games: { record: LearningGame; review: GameReview; entries: SeriesEntry[]; pgn: string }[];
  current: Position; currentEntries: SeriesEntry[];
};
