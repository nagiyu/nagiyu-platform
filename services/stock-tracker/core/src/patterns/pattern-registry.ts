import { CandlestickPattern } from './candlestick-pattern.js';
import { MorningStar } from './morning-star.js';

export const PATTERN_REGISTRY: readonly CandlestickPattern[] = [new MorningStar()];
