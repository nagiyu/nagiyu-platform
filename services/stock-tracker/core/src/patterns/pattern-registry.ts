import { CandlestickPattern } from './candlestick-pattern.js';
import { EveningStar } from './evening-star.js';
import { MorningStar } from './morning-star.js';
import { RedThreeSoldiersHesitation } from './red-three-soldiers-hesitation.js';

export const PATTERN_REGISTRY: readonly CandlestickPattern[] = [
  new MorningStar(),
  new EveningStar(),
  new RedThreeSoldiersHesitation(),
];
