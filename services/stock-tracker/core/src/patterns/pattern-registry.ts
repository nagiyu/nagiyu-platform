import { CandlestickPattern } from './candlestick-pattern.js';
import { EveningStar } from './evening-star.js';
import { MorningStar } from './morning-star.js';
import { ThreeWhiteSoldiers } from './three-white-soldiers.js';

export const PATTERN_REGISTRY: readonly CandlestickPattern[] = [
  new MorningStar(),
  new EveningStar(),
  new ThreeWhiteSoldiers(),
];
