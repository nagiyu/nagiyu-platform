import { CandlestickPattern } from './candlestick-pattern.js';
import { AscendingTriangle } from './ascending-triangle.js';
import { BearFlag } from './bear-flag.js';
import { BearishEngulfing } from './bearish-engulfing.js';
import { BearishFullEngulfing } from './bearish-full-engulfing.js';
import { BearishHarami } from './bearish-harami.js';
import { BullFlag } from './bull-flag.js';
import { BullishEngulfing } from './bullish-engulfing.js';
import { BullishHaramiTop } from './bullish-harami-top.js';
import { DojiStar } from './doji-star.js';
import { DoubleTop } from './double-top.js';
import { EveningStar } from './evening-star.js';
import { FallingThreeMethods } from './falling-three-methods.js';
import { HangingMan } from './hanging-man.js';
import { HaramiCrossBuy } from './harami-cross-buy.js';
import { HeadAndShoulders } from './head-and-shoulders.js';
import { InverseHeadAndShoulders } from './inverse-head-and-shoulders.js';
import { MorningStar } from './morning-star.js';
import { RedThreeSoldiersHesitation } from './red-three-soldiers-hesitation.js';
import { RisingDoubleBottom } from './rising-double-bottom.js';
import { RisingThreeMethods } from './rising-three-methods.js';
import { RisingWedge } from './rising-wedge.js';
import { ShootingStar } from './shooting-star.js';
import { ThreeBlackCrows } from './three-black-crows.js';
import { ThreeBlackCrowsGaps } from './three-black-crows-gaps.js';
import { ThreeGapsHammering } from './three-gaps-hammering.js';
import { ThreeWhiteSoldiers } from './three-white-soldiers.js';
import { TweezerBottom } from './tweezer-bottom.js';

export const PATTERN_REGISTRY: readonly CandlestickPattern[] = [
  new MorningStar(),
  new EveningStar(),
  new RedThreeSoldiersHesitation(),
  new ThreeWhiteSoldiers(),
  new TweezerBottom(),
  new RisingThreeMethods(),
  new ThreeGapsHammering(),
  new BullishEngulfing(),
  new HaramiCrossBuy(),
  new AscendingTriangle(),
  new BearFlag(),
  new BullFlag(),
  new DoubleTop(),
  new InverseHeadAndShoulders(),
  new RisingDoubleBottom(),
  new RisingWedge(),
  new HeadAndShoulders(),
  new ShootingStar(),
  new HangingMan(),
  new FallingThreeMethods(),
  new ThreeBlackCrows(),
  new DojiStar(),
  new BearishHarami(),
  new BearishEngulfing(),
  new ThreeBlackCrowsGaps(),
  new BullishHaramiTop(),
  new BearishFullEngulfing(),
];
