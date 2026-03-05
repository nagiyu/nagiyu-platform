import { CandlestickPattern } from './candlestick-pattern.js';
import { AscendingTriangle } from './ascending-triangle.js';
import { BearFlag } from './bear-flag.js';
import { BullFlag } from './bull-flag.js';
import { DoubleTop } from './double-top.js';
import { EveningStar } from './evening-star.js';
import { HeadAndShoulders } from './head-and-shoulders.js';
import { InverseHeadAndShoulders } from './inverse-head-and-shoulders.js';
import { MorningStar } from './morning-star.js';
import { RedThreeSoldiersHesitation } from './red-three-soldiers-hesitation.js';
import { RisingDoubleBottom } from './rising-double-bottom.js';
import { RisingWedge } from './rising-wedge.js';
import { ThreeWhiteSoldiers } from './three-white-soldiers.js';

export const PATTERN_REGISTRY: readonly CandlestickPattern[] = [
  new MorningStar(),
  new EveningStar(),
  new RedThreeSoldiersHesitation(),
  new ThreeWhiteSoldiers(),
  new AscendingTriangle(),
  new BearFlag(),
  new BullFlag(),
  new DoubleTop(),
  new InverseHeadAndShoulders(),
  new RisingDoubleBottom(),
  new RisingWedge(),
  new HeadAndShoulders(),
];
