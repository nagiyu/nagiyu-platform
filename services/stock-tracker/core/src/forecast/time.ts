/**
 * Stock Tracker Core - Forecast 市場・セッション時刻
 *
 * 将来データ混入を防ぐための時刻の規則（design.md §1.4・§4）の基礎になる純粋関数群。
 *
 * 市場への振り分け・名目の取引時刻は、いずれも取引所マスタ（Exchange の 市場・Timezone・
 * Start・End）から求める。取引所は画面から追加・編集でき、時間外取引込みの Start/End を
 * 標準として扱っている（他の箇所、例えば `services/trading-hours-checker.ts` の
 * `getLastTradingDate` も End を使う）ため、core が固定の ExchangeID→市場対応表やセッション
 * 時刻の定数を持つのではなく、呼び出し側から {@link ExchangeSessionInfo} の配列として
 * 受け取る（純粋関数のまま保つ。design.md §1.1 ADR-V4-01・§1.4）。
 */
import { fromZonedTime } from 'date-fns-tz';
import { FORECAST_ERROR_MESSAGES, type Market } from './constants.js';

/** 取引所マスタ（Exchange）から渡す、時刻の規則・市場への振り分けに要る最小限の情報 */
export interface ExchangeSessionInfo {
  exchangeId: string;
  /**
   * 市場コード（design.md ADR-V4-01。初期設定は 'JP' / 'US'）。
   * 未設定（market を持たない取引所）は、未対応の ExchangeID と同様に除外して扱う。
   */
  market?: Market;
  /** IANA タイムゾーン（例: Asia/Tokyo） */
  timezone: string;
  /** 取引開始時刻 (HH:MM)。時間外取引込みの Start */
  start: string;
  /** 取引終了時刻 (HH:MM)。時間外取引込みの End */
  end: string;
}

function findExchangeSession(
  exchangeId: string,
  exchanges: readonly ExchangeSessionInfo[]
): ExchangeSessionInfo | undefined {
  return exchanges.find((e) => e.exchangeId === exchangeId);
}

/**
 * ExchangeID から市場を判定する（取引所マスタの market 属性。design.md ADR-V4-01）。
 * マスタに無い ExchangeID、または market が未設定の取引所は例外を投げる。
 *
 * バッチのように多数のバーを扱う場所では、1 件の未対応 ID で処理全体を止めないため
 * {@link tryGetMarketForExchange} を使うこと（NFR-2。design.md §1.1 ADR-V4-01）。
 */
export function getMarketForExchange(
  exchangeId: string,
  exchanges: readonly ExchangeSessionInfo[]
): Market {
  const market = tryGetMarketForExchange(exchangeId, exchanges);
  if (market === undefined) {
    throw new Error(`${FORECAST_ERROR_MESSAGES.UNKNOWN_EXCHANGE}: ${exchangeId}`);
  }
  return market;
}

/**
 * ExchangeID から市場を判定する（例外を投げない版）。マスタに無い ExchangeID、または
 * market が未設定の取引所なら undefined。呼び出し側は該当の足を除外して処理を続け、
 * 除外した ID を結果に残してログできるようにする（NFR-2。サマリー保存・表示は確度の
 * 算出失敗の影響を受けない）。
 */
export function tryGetMarketForExchange(
  exchangeId: string,
  exchanges: readonly ExchangeSessionInfo[]
): Market | undefined {
  return findExchangeSession(exchangeId, exchanges)?.market;
}

/** exchangeId の取引所マスタ情報があるか（未対応 ID や、マスタに無い ID の除外判定に使う） */
export function hasExchangeSession(
  exchangeId: string,
  exchanges: readonly ExchangeSessionInfo[]
): boolean {
  return findExchangeSession(exchangeId, exchanges) !== undefined;
}

/**
 * 取引所マスタが持つ市場コードの集合（重複なし・ソート済み）。design.md §1.1 の
 * 「取引所マスタの市場属性で決める」を踏まえ、市場ごとに回す処理（観測カレンダー・
 * MarketForecast・中立帯のカレンダー等）は、この集合を対象にループする。
 * market が未設定の取引所は数えない。
 */
export function distinctMarkets(exchanges: readonly ExchangeSessionInfo[]): Market[] {
  const set = new Set<Market>();
  for (const e of exchanges) {
    if (e.market !== undefined) set.add(e.market);
  }
  return [...set].sort();
}

/**
 * 取引所の名目の取引開始・引け時刻（UTC の Unix timestamp ms）を返す。
 * 取引所マスタに exchangeId が無ければ例外を投げる（呼び出し側は {@link hasExchangeSession} で
 * 事前に除外すること。NFR-2）。
 */
export function nominalExchangeTime(
  exchangeId: string,
  date: string,
  which: 'open' | 'close',
  exchanges: readonly ExchangeSessionInfo[]
): number {
  const info = findExchangeSession(exchangeId, exchanges);
  if (info === undefined) {
    throw new Error(`${FORECAST_ERROR_MESSAGES.UNKNOWN_EXCHANGE}: ${exchangeId}`);
  }
  const time = which === 'open' ? info.start : info.end;
  return fromZonedTime(`${date}T${time}:00`, info.timezone).getTime();
}

/**
 * 市場 M の名目引け時刻（UTC ms）: 取引所マスタで市場が M の取引所のうち、End の最も遅いもの
 * （design.md §1.4。同じ市場に複数の取引所があっても（例: US の初期設定）安全側になるように
 * 「最も遅いもの」を取る）。
 *
 * 市場 M に属する取引所が 1 つもマスタに無ければ例外を投げる。
 */
export function nominalMarketCloseTime(
  market: Market,
  date: string,
  exchanges: readonly ExchangeSessionInfo[]
): number {
  const relevant = exchanges.filter((e) => e.market === market);
  if (relevant.length === 0) {
    throw new Error(`${FORECAST_ERROR_MESSAGES.UNKNOWN_EXCHANGE}: ${market}`);
  }
  return Math.max(
    ...relevant.map((e) => nominalExchangeTime(e.exchangeId, date, 'close', exchanges))
  );
}

/**
 * 銘柄（取引所）のサンプルを、市場 M の D の予測に使ってよいかどうか（design.md §1.4）。
 *
 * 名目引け時刻(サンプルの翌営業日, サンプルの取引所) ≤ 名目引け時刻(D, M)
 */
export function isTickerSampleUsable(
  sampleNextDate: string,
  sampleExchangeId: string,
  predictionDate: string,
  predictionMarket: Market,
  exchanges: readonly ExchangeSessionInfo[]
): boolean {
  return (
    nominalExchangeTime(sampleExchangeId, sampleNextDate, 'close', exchanges) <=
    nominalMarketCloseTime(predictionMarket, predictionDate, exchanges)
  );
}

/**
 * 市場レベルのサンプル（Q-MKT）を、市場 M の D の予測に使ってよいかどうか（design.md §1.4）。
 * サンプル自身が特定の取引所を持たないため、サンプルの市場の名目引け時刻を使う。
 */
export function isMarketSampleUsable(
  sampleNextDate: string,
  sampleMarket: Market,
  predictionDate: string,
  predictionMarket: Market,
  exchanges: readonly ExchangeSessionInfo[]
): boolean {
  return (
    nominalMarketCloseTime(sampleMarket, sampleNextDate, exchanges) <=
    nominalMarketCloseTime(predictionMarket, predictionDate, exchanges)
  );
}

/**
 * 市場の観測カレンダー（ソート済み日付配列）から、date の翌営業日を返す。
 * date がカレンダーに無い、または最終日の場合は undefined。
 */
export function getNextCalendarDate(calendar: readonly string[], date: string): string | undefined {
  const index = calendar.indexOf(date);
  if (index === -1 || index + 1 >= calendar.length) {
    return undefined;
  }
  return calendar[index + 1];
}

/**
 * 市場の観測カレンダーにおける date のインデックス（見つからなければ -1）。
 */
export function getCalendarIndex(calendar: readonly string[], date: string): number {
  return calendar.indexOf(date);
}
