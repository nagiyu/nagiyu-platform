/**
 * Stock Tracker Core - Validation Functions
 *
 * 入力データのバリデーション関数
 * architecture.md のバリデーションルールに準拠
 */

import type { ValidationResult } from '@nagiyu/common';
import { isNonEmptyString, isValidTimestamp } from '@nagiyu/common';
import { isValidPrice, isValidQuantity } from './helpers.js';
import { PRICE_SOURCES, EXCHANGE_MARKETS } from '../entities/exchange.entity.js';
import type { ExchangeEntity } from '../entities/exchange.entity.js';
import type { TickerEntity } from '../entities/ticker.entity.js';
import type { HoldingEntity } from '../entities/holding.entity.js';
import type { AlertEntity } from '../entities/alert.entity.js';

/**
 * サポートするタイムゾーン (IANA 形式)
 *
 * 扱う市場 (日本・米国) に対応する値だけを許可する。他の値を許すと、存在しない
 * タイムゾーンの取引所が登録され、取引時間の判定で例外になる。
 */
const SUPPORTED_TIMEZONES: readonly string[] = ['America/New_York', 'Asia/Tokyo'];

/** サポートする通貨 (ISO 4217)。扱う市場 (日本・米国) の通貨だけを許可する */
const SUPPORTED_CURRENCIES: readonly string[] = ['USD', 'JPY'];

/**
 * バリデーションエラーメッセージ定数
 */
const ERROR_MESSAGES = {
  // Exchange
  EXCHANGE_ID_REQUIRED: '取引所IDは必須です',
  EXCHANGE_ID_INVALID_FORMAT: '取引所IDは1-50文字の英数字とハイフンのみ使用できます',
  EXCHANGE_NAME_REQUIRED: '取引所名は必須です',
  EXCHANGE_NAME_TOO_LONG: '取引所名は200文字以内で入力してください',
  EXCHANGE_KEY_REQUIRED: 'TradingView APIキーは必須です',
  EXCHANGE_KEY_INVALID_FORMAT: 'TradingView APIキーは1-20文字の英大文字と数字のみ使用できます',
  EXCHANGE_TIMEZONE_REQUIRED: 'タイムゾーンは必須です',
  EXCHANGE_TIMEZONE_NOT_SUPPORTED: `タイムゾーンは ${SUPPORTED_TIMEZONES.map((tz) => `"${tz}"`).join(' または ')} のいずれかを指定してください`,
  EXCHANGE_START_REQUIRED: '取引開始時刻は必須です',
  EXCHANGE_START_INVALID_FORMAT: '取引開始時刻はHH:MM形式（例: 04:00）で入力してください',
  EXCHANGE_END_REQUIRED: '取引終了時刻は必須です',
  EXCHANGE_END_INVALID_FORMAT: '取引終了時刻はHH:MM形式（例: 20:00）で入力してください',
  EXCHANGE_PRICE_SOURCE_INVALID:
    'データソースは "tradingview" または "finnhub" のいずれかを指定してください',
  EXCHANGE_MARKET_INVALID: '市場は "JP" または "US" のいずれかを指定してください',
  EXCHANGE_CREATED_AT_REQUIRED: '作成日時は必須です',
  EXCHANGE_CREATED_AT_INVALID: '作成日時が無効です',
  EXCHANGE_UPDATED_AT_REQUIRED: '更新日時は必須です',
  EXCHANGE_UPDATED_AT_INVALID: '更新日時が無効です',

  // Ticker
  TICKER_ID_REQUIRED: 'ティッカーIDは必須です',
  TICKER_ID_INVALID_FORMAT:
    'ティッカーIDは{取引所キー}:{シンボル}形式で入力してください（例: NSDQ:AAPL）',
  TICKER_SYMBOL_REQUIRED: 'シンボルは必須です',
  TICKER_SYMBOL_INVALID_FORMAT: 'シンボルは1-20文字の英大文字と数字のみ使用できます',
  TICKER_NAME_REQUIRED: '銘柄名は必須です',
  TICKER_NAME_TOO_LONG: '銘柄名は200文字以内で入力してください',
  TICKER_EXCHANGE_ID_REQUIRED: '取引所IDは必須です',
  TICKER_CREATED_AT_REQUIRED: '作成日時は必須です',
  TICKER_CREATED_AT_INVALID: '作成日時が無効です',
  TICKER_UPDATED_AT_REQUIRED: '更新日時は必須です',
  TICKER_UPDATED_AT_INVALID: '更新日時が無効です',

  // Holding
  HOLDING_USER_ID_REQUIRED: 'ユーザーIDは必須です',
  HOLDING_TICKER_ID_REQUIRED: 'ティッカーIDは必須です',
  HOLDING_EXCHANGE_ID_REQUIRED: '取引所IDは必須です',
  HOLDING_QUANTITY_REQUIRED: '保有数は必須です',
  HOLDING_QUANTITY_INVALID: '保有数は0.0001〜1,000,000,000の範囲で入力してください',
  HOLDING_AVERAGE_PRICE_REQUIRED: '平均取得価格は必須です',
  HOLDING_AVERAGE_PRICE_INVALID: '平均取得価格は0.01〜1,000,000の範囲で入力してください',
  HOLDING_CURRENCY_REQUIRED: '通貨コードは必須です',
  HOLDING_CURRENCY_NOT_SUPPORTED: `通貨コードは ${SUPPORTED_CURRENCIES.map((c) => `"${c}"`).join(' または ')} のいずれかを指定してください`,
  HOLDING_CREATED_AT_REQUIRED: '作成日時は必須です',
  HOLDING_CREATED_AT_INVALID: '作成日時が無効です',
  HOLDING_UPDATED_AT_REQUIRED: '更新日時は必須です',
  HOLDING_UPDATED_AT_INVALID: '更新日時が無効です',

  // Alert
  ALERT_ID_REQUIRED: 'アラートIDは必須です',
  ALERT_ID_INVALID_FORMAT: 'アラートIDはUUID v4形式で入力してください',
  ALERT_USER_ID_REQUIRED: 'ユーザーIDは必須です',
  ALERT_TICKER_ID_REQUIRED: 'ティッカーIDは必須です',
  ALERT_EXCHANGE_ID_REQUIRED: '取引所IDは必須です',
  ALERT_MODE_REQUIRED: 'モードは必須です',
  ALERT_MODE_INVALID: 'モードは"Buy"または"Sell"を指定してください',
  ALERT_FREQUENCY_REQUIRED: '通知頻度は必須です',
  ALERT_FREQUENCY_INVALID: '通知頻度は"MINUTE_LEVEL"または"HOURLY_LEVEL"を指定してください',
  ALERT_ENABLED_REQUIRED: '有効/無効フラグは必須です',
  ALERT_CONDITION_LIST_REQUIRED: 'アラート条件は必須です',
  ALERT_CONDITION_LIST_EMPTY: 'アラート条件は1つ以上指定してください',
  ALERT_CONDITION_LIST_TOO_MANY: 'Phase 1ではアラート条件は1つまでです',
  ALERT_CONDITION_FIELD_INVALID: 'Phase 1ではフィールドは"price"のみ指定できます',
  ALERT_CONDITION_OPERATOR_INVALID: 'Phase 1では演算子は"gte"または"lte"のみ指定できます',
  ALERT_CONDITION_VALUE_REQUIRED: '条件値は必須です',
  ALERT_CONDITION_VALUE_INVALID: '条件値は0.01〜1,000,000の範囲で入力してください',
  ALERT_LOGICAL_OPERATOR_INVALID: '論理演算子は"AND"または"OR"を指定してください',
  ALERT_LOGICAL_OPERATOR_REQUIRED: '2条件の場合は論理演算子が必須です',
  ALERT_LOGICAL_OPERATOR_UNEXPECTED: '単一条件の場合、論理演算子は設定できません',
  ALERT_CONDITION_OPERATORS_DUPLICATE: '同じ演算子を複数指定することはできません',
  ALERT_CONDITION_RANGE_INVALID_AND:
    '範囲内アラート(AND)の場合、下限価格は上限価格より小さい値を設定してください',
  ALERT_CONDITION_RANGE_INVALID_OR:
    '範囲外アラート(OR)の場合、下限価格は上限価格より大きい値を設定してください',
  ALERT_SUBSCRIPTION_ENDPOINT_REQUIRED: 'Web Pushサブスクリプションエンドポイントは必須です',
  ALERT_SUBSCRIPTION_KEYS_P256DH_REQUIRED: 'Web Push公開鍵は必須です',
  ALERT_SUBSCRIPTION_KEYS_AUTH_REQUIRED: 'Web Push認証シークレットは必須です',
  ALERT_CUSTOM_MESSAGE_TOO_LONG: 'カスタムメッセージは500文字以内で入力してください',
  ALERT_CREATED_AT_REQUIRED: '作成日時は必須です',
  ALERT_CREATED_AT_INVALID: '作成日時が無効です',
  ALERT_UPDATED_AT_REQUIRED: '更新日時は必須です',
  ALERT_UPDATED_AT_INVALID: '更新日時が無効です',
} as const;

// ValidationResult型を再エクスポート
export type { ValidationResult };

/**
 * 取引所のバリデーション
 *
 * @param exchange - 取引所オブジェクト
 * @returns バリデーション結果
 */
export function validateExchange(exchange: unknown): ValidationResult {
  const errors: string[] = [];

  // null/undefined チェック
  if (exchange === null || exchange === undefined) {
    return { valid: false, errors: ['取引所データが指定されていません'] };
  }

  // 型チェック
  if (typeof exchange !== 'object') {
    return { valid: false, errors: ['取引所データが不正です'] };
  }

  const ex = exchange as Partial<ExchangeEntity>;

  // exchangeId
  if (!ex.exchangeId || !isNonEmptyString(ex.exchangeId)) {
    errors.push(ERROR_MESSAGES.EXCHANGE_ID_REQUIRED);
  } else if (!/^[a-zA-Z0-9-]{1,50}$/.test(ex.exchangeId)) {
    errors.push(ERROR_MESSAGES.EXCHANGE_ID_INVALID_FORMAT);
  }

  // name
  if (!ex.name || !isNonEmptyString(ex.name)) {
    errors.push(ERROR_MESSAGES.EXCHANGE_NAME_REQUIRED);
  } else if (ex.name.length > 200) {
    errors.push(ERROR_MESSAGES.EXCHANGE_NAME_TOO_LONG);
  }

  // key
  if (!ex.key || !isNonEmptyString(ex.key)) {
    errors.push(ERROR_MESSAGES.EXCHANGE_KEY_REQUIRED);
  } else if (!/^[A-Z0-9]{1,20}$/.test(ex.key)) {
    errors.push(ERROR_MESSAGES.EXCHANGE_KEY_INVALID_FORMAT);
  }

  // timezone
  if (!ex.timezone || !isNonEmptyString(ex.timezone)) {
    errors.push(ERROR_MESSAGES.EXCHANGE_TIMEZONE_REQUIRED);
  } else if (!SUPPORTED_TIMEZONES.includes(ex.timezone)) {
    errors.push(ERROR_MESSAGES.EXCHANGE_TIMEZONE_NOT_SUPPORTED);
  }

  // start
  if (!ex.start || !isNonEmptyString(ex.start)) {
    errors.push(ERROR_MESSAGES.EXCHANGE_START_REQUIRED);
  } else if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(ex.start)) {
    errors.push(ERROR_MESSAGES.EXCHANGE_START_INVALID_FORMAT);
  }

  // end
  if (!ex.end || !isNonEmptyString(ex.end)) {
    errors.push(ERROR_MESSAGES.EXCHANGE_END_REQUIRED);
  } else if (!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(ex.end)) {
    errors.push(ERROR_MESSAGES.EXCHANGE_END_INVALID_FORMAT);
  }

  // priceSource (省略可能。指定される場合は有効値のみ許可)
  if (ex.priceSource !== undefined) {
    if (!(PRICE_SOURCES as readonly string[]).includes(ex.priceSource as string)) {
      errors.push(ERROR_MESSAGES.EXCHANGE_PRICE_SOURCE_INVALID);
    }
  }

  // market (省略可能。未設定に戻す null も許可し、指定される場合は有効値のみ許可)
  if (ex.market !== undefined && ex.market !== null) {
    if (!(EXCHANGE_MARKETS as readonly string[]).includes(ex.market as string)) {
      errors.push(ERROR_MESSAGES.EXCHANGE_MARKET_INVALID);
    }
  }

  // createdAt
  if (ex.createdAt === undefined || ex.createdAt === null) {
    errors.push(ERROR_MESSAGES.EXCHANGE_CREATED_AT_REQUIRED);
  } else if (!isValidTimestamp(ex.createdAt)) {
    errors.push(ERROR_MESSAGES.EXCHANGE_CREATED_AT_INVALID);
  }

  // updatedAt
  if (ex.updatedAt === undefined || ex.updatedAt === null) {
    errors.push(ERROR_MESSAGES.EXCHANGE_UPDATED_AT_REQUIRED);
  } else if (!isValidTimestamp(ex.updatedAt)) {
    errors.push(ERROR_MESSAGES.EXCHANGE_UPDATED_AT_INVALID);
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

/**
 * ティッカーのバリデーション
 *
 * @param ticker - ティッカーオブジェクト
 * @returns バリデーション結果
 */
export function validateTicker(ticker: unknown): ValidationResult {
  const errors: string[] = [];

  // null/undefined チェック
  if (ticker === null || ticker === undefined) {
    return { valid: false, errors: ['ティッカーデータが指定されていません'] };
  }

  // 型チェック
  if (typeof ticker !== 'object') {
    return { valid: false, errors: ['ティッカーデータが不正です'] };
  }

  const tk = ticker as Partial<TickerEntity>;

  // tickerId
  if (!tk.tickerId || !isNonEmptyString(tk.tickerId)) {
    errors.push(ERROR_MESSAGES.TICKER_ID_REQUIRED);
  } else if (!/^[A-Z0-9]{1,20}:[A-Z0-9]{1,20}$/.test(tk.tickerId)) {
    errors.push(ERROR_MESSAGES.TICKER_ID_INVALID_FORMAT);
  }

  // symbol
  if (!tk.symbol || !isNonEmptyString(tk.symbol)) {
    errors.push(ERROR_MESSAGES.TICKER_SYMBOL_REQUIRED);
  } else if (!/^[A-Z0-9]{1,20}$/.test(tk.symbol)) {
    errors.push(ERROR_MESSAGES.TICKER_SYMBOL_INVALID_FORMAT);
  }

  // name
  if (!tk.name || !isNonEmptyString(tk.name)) {
    errors.push(ERROR_MESSAGES.TICKER_NAME_REQUIRED);
  } else if (tk.name.length > 200) {
    errors.push(ERROR_MESSAGES.TICKER_NAME_TOO_LONG);
  }

  // exchangeId
  if (!tk.exchangeId || !isNonEmptyString(tk.exchangeId)) {
    errors.push(ERROR_MESSAGES.TICKER_EXCHANGE_ID_REQUIRED);
  }

  // createdAt
  if (tk.createdAt === undefined || tk.createdAt === null) {
    errors.push(ERROR_MESSAGES.TICKER_CREATED_AT_REQUIRED);
  } else if (!isValidTimestamp(tk.createdAt)) {
    errors.push(ERROR_MESSAGES.TICKER_CREATED_AT_INVALID);
  }

  // updatedAt
  if (tk.updatedAt === undefined || tk.updatedAt === null) {
    errors.push(ERROR_MESSAGES.TICKER_UPDATED_AT_REQUIRED);
  } else if (!isValidTimestamp(tk.updatedAt)) {
    errors.push(ERROR_MESSAGES.TICKER_UPDATED_AT_INVALID);
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

/**
 * 保有株式のバリデーション
 *
 * @param holding - 保有株式オブジェクト
 * @returns バリデーション結果
 */
export function validateHolding(holding: unknown): ValidationResult {
  const errors: string[] = [];

  // null/undefined チェック
  if (holding === null || holding === undefined) {
    return { valid: false, errors: ['保有株式データが指定されていません'] };
  }

  // 型チェック
  if (typeof holding !== 'object' || Array.isArray(holding)) {
    return { valid: false, errors: ['保有株式データが不正です'] };
  }

  const hld = holding as Partial<HoldingEntity>;

  // userId
  if (!hld.userId || !isNonEmptyString(hld.userId)) {
    errors.push(ERROR_MESSAGES.HOLDING_USER_ID_REQUIRED);
  }

  // tickerId
  if (!hld.tickerId || !isNonEmptyString(hld.tickerId)) {
    errors.push(ERROR_MESSAGES.HOLDING_TICKER_ID_REQUIRED);
  }

  // exchangeId
  if (!hld.exchangeId || !isNonEmptyString(hld.exchangeId)) {
    errors.push(ERROR_MESSAGES.HOLDING_EXCHANGE_ID_REQUIRED);
  }

  // quantity
  if (hld.quantity === undefined || hld.quantity === null) {
    errors.push(ERROR_MESSAGES.HOLDING_QUANTITY_REQUIRED);
  } else if (!isValidQuantity(hld.quantity)) {
    errors.push(ERROR_MESSAGES.HOLDING_QUANTITY_INVALID);
  }

  // averagePrice
  if (hld.averagePrice === undefined || hld.averagePrice === null) {
    errors.push(ERROR_MESSAGES.HOLDING_AVERAGE_PRICE_REQUIRED);
  } else if (!isValidPrice(hld.averagePrice)) {
    errors.push(ERROR_MESSAGES.HOLDING_AVERAGE_PRICE_INVALID);
  }

  // currency
  if (!hld.currency || !isNonEmptyString(hld.currency)) {
    errors.push(ERROR_MESSAGES.HOLDING_CURRENCY_REQUIRED);
  } else if (!SUPPORTED_CURRENCIES.includes(hld.currency)) {
    errors.push(ERROR_MESSAGES.HOLDING_CURRENCY_NOT_SUPPORTED);
  }

  // createdAt
  if (hld.createdAt === undefined || hld.createdAt === null) {
    errors.push(ERROR_MESSAGES.HOLDING_CREATED_AT_REQUIRED);
  } else if (!isValidTimestamp(hld.createdAt)) {
    errors.push(ERROR_MESSAGES.HOLDING_CREATED_AT_INVALID);
  }

  // updatedAt
  if (hld.updatedAt === undefined || hld.updatedAt === null) {
    errors.push(ERROR_MESSAGES.HOLDING_UPDATED_AT_REQUIRED);
  } else if (!isValidTimestamp(hld.updatedAt)) {
    errors.push(ERROR_MESSAGES.HOLDING_UPDATED_AT_INVALID);
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

/**
 * アラートのバリデーション
 *
 * @param alert - アラートオブジェクト
 * @returns バリデーション結果
 */
export function validateAlert(alert: unknown): ValidationResult {
  const errors: string[] = [];

  // null/undefined チェック
  if (alert === null || alert === undefined) {
    return { valid: false, errors: ['アラートデータが指定されていません'] };
  }

  // 型チェック
  if (typeof alert !== 'object') {
    return { valid: false, errors: ['アラートデータが不正です'] };
  }

  const alt = alert as Partial<AlertEntity>;

  // alertId
  if (!alt.alertId || !isNonEmptyString(alt.alertId)) {
    errors.push(ERROR_MESSAGES.ALERT_ID_REQUIRED);
  } else if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(alt.alertId)
  ) {
    errors.push(ERROR_MESSAGES.ALERT_ID_INVALID_FORMAT);
  }

  // userId
  if (!alt.userId || !isNonEmptyString(alt.userId)) {
    errors.push(ERROR_MESSAGES.ALERT_USER_ID_REQUIRED);
  }

  // tickerId
  if (!alt.tickerId || !isNonEmptyString(alt.tickerId)) {
    errors.push(ERROR_MESSAGES.ALERT_TICKER_ID_REQUIRED);
  }

  // exchangeId
  if (!alt.exchangeId || !isNonEmptyString(alt.exchangeId)) {
    errors.push(ERROR_MESSAGES.ALERT_EXCHANGE_ID_REQUIRED);
  }

  // mode
  if (!alt.mode) {
    errors.push(ERROR_MESSAGES.ALERT_MODE_REQUIRED);
  } else if (alt.mode !== 'Buy' && alt.mode !== 'Sell') {
    errors.push(ERROR_MESSAGES.ALERT_MODE_INVALID);
  }

  // frequency
  if (!alt.frequency) {
    errors.push(ERROR_MESSAGES.ALERT_FREQUENCY_REQUIRED);
  } else if (alt.frequency !== 'MINUTE_LEVEL' && alt.frequency !== 'HOURLY_LEVEL') {
    errors.push(ERROR_MESSAGES.ALERT_FREQUENCY_INVALID);
  }

  // enabled
  if (alt.enabled === undefined || alt.enabled === null) {
    errors.push(ERROR_MESSAGES.ALERT_ENABLED_REQUIRED);
  }

  // conditionList
  if (!alt.conditionList) {
    errors.push(ERROR_MESSAGES.ALERT_CONDITION_LIST_REQUIRED);
  } else if (!Array.isArray(alt.conditionList)) {
    errors.push(ERROR_MESSAGES.ALERT_CONDITION_LIST_REQUIRED);
  } else if (alt.conditionList.length === 0) {
    errors.push(ERROR_MESSAGES.ALERT_CONDITION_LIST_EMPTY);
  } else if (alt.conditionList.length > 2) {
    errors.push(ERROR_MESSAGES.ALERT_CONDITION_LIST_TOO_MANY);
  } else if (alt.conditionList.length === 2) {
    // 2条件の場合のバリデーション
    const [cond1, cond2] = alt.conditionList;

    // logicalOperator のチェック
    if (!alt.logicalOperator) {
      errors.push(ERROR_MESSAGES.ALERT_LOGICAL_OPERATOR_REQUIRED);
    } else if (alt.logicalOperator !== 'AND' && alt.logicalOperator !== 'OR') {
      errors.push(ERROR_MESSAGES.ALERT_LOGICAL_OPERATOR_INVALID);
    }

    // 両方とも price フィールドであることをチェック
    if (cond1.field !== 'price' || cond2.field !== 'price') {
      errors.push(ERROR_MESSAGES.ALERT_CONDITION_FIELD_INVALID);
    }

    // operator のチェック
    if (cond1.operator !== 'gte' && cond1.operator !== 'lte') {
      errors.push(ERROR_MESSAGES.ALERT_CONDITION_OPERATOR_INVALID);
    }
    if (cond2.operator !== 'gte' && cond2.operator !== 'lte') {
      errors.push(ERROR_MESSAGES.ALERT_CONDITION_OPERATOR_INVALID);
    }

    // operator の組み合わせチェック
    if (cond1.operator === cond2.operator) {
      errors.push(ERROR_MESSAGES.ALERT_CONDITION_OPERATORS_DUPLICATE);
    }

    // 条件値のチェック
    if (cond1.value === undefined || cond1.value === null) {
      errors.push(ERROR_MESSAGES.ALERT_CONDITION_VALUE_REQUIRED);
    } else if (!isValidPrice(cond1.value)) {
      errors.push(ERROR_MESSAGES.ALERT_CONDITION_VALUE_INVALID);
    }

    if (cond2.value === undefined || cond2.value === null) {
      errors.push(ERROR_MESSAGES.ALERT_CONDITION_VALUE_REQUIRED);
    } else if (!isValidPrice(cond2.value)) {
      errors.push(ERROR_MESSAGES.ALERT_CONDITION_VALUE_INVALID);
    }

    // 範囲の妥当性チェック（AND/OR別）
    if (
      alt.logicalOperator &&
      cond1.operator !== cond2.operator &&
      cond1.value !== undefined &&
      cond1.value !== null &&
      cond2.value !== undefined &&
      cond2.value !== null &&
      isValidPrice(cond1.value) &&
      isValidPrice(cond2.value)
    ) {
      const gteCondition = cond1.operator === 'gte' ? cond1 : cond2;
      const lteCondition = cond1.operator === 'lte' ? cond1 : cond2;

      if (alt.logicalOperator === 'AND') {
        // 範囲内: 下限 < 上限
        if (gteCondition.value >= lteCondition.value) {
          errors.push(ERROR_MESSAGES.ALERT_CONDITION_RANGE_INVALID_AND);
        }
      } else if (alt.logicalOperator === 'OR') {
        // 範囲外: 下限 > 上限（つまり lte < gte）
        if (lteCondition.value >= gteCondition.value) {
          errors.push(ERROR_MESSAGES.ALERT_CONDITION_RANGE_INVALID_OR);
        }
      }
    }
  } else if (alt.conditionList.length === 1) {
    // 単一条件の場合のバリデーション
    const condition = alt.conditionList[0];

    // 単一条件の場合、LogicalOperator は未定義であるべき
    if (alt.logicalOperator !== undefined) {
      errors.push(ERROR_MESSAGES.ALERT_LOGICAL_OPERATOR_UNEXPECTED);
    }

    if (condition.field !== 'price') {
      errors.push(ERROR_MESSAGES.ALERT_CONDITION_FIELD_INVALID);
    }

    if (condition.operator !== 'gte' && condition.operator !== 'lte') {
      errors.push(ERROR_MESSAGES.ALERT_CONDITION_OPERATOR_INVALID);
    }

    if (condition.value === undefined || condition.value === null) {
      errors.push(ERROR_MESSAGES.ALERT_CONDITION_VALUE_REQUIRED);
    } else if (!isValidPrice(condition.value)) {
      errors.push(ERROR_MESSAGES.ALERT_CONDITION_VALUE_INVALID);
    }
  }

  // subscription.endpoint
  if (!alt.subscription?.endpoint || !isNonEmptyString(alt.subscription.endpoint)) {
    errors.push(ERROR_MESSAGES.ALERT_SUBSCRIPTION_ENDPOINT_REQUIRED);
  }

  // subscription.keys.p256dh
  if (!alt.subscription?.keys?.p256dh || !isNonEmptyString(alt.subscription.keys.p256dh)) {
    errors.push(ERROR_MESSAGES.ALERT_SUBSCRIPTION_KEYS_P256DH_REQUIRED);
  }

  // subscription.keys.auth
  if (!alt.subscription?.keys?.auth || !isNonEmptyString(alt.subscription.keys.auth)) {
    errors.push(ERROR_MESSAGES.ALERT_SUBSCRIPTION_KEYS_AUTH_REQUIRED);
  }

  // customMessage（任意、最大500文字）
  if (typeof alt.customMessage === 'string' && alt.customMessage.length > 500) {
    errors.push(ERROR_MESSAGES.ALERT_CUSTOM_MESSAGE_TOO_LONG);
  }

  // createdAt
  if (alt.createdAt === undefined || alt.createdAt === null) {
    errors.push(ERROR_MESSAGES.ALERT_CREATED_AT_REQUIRED);
  } else if (!isValidTimestamp(alt.createdAt)) {
    errors.push(ERROR_MESSAGES.ALERT_CREATED_AT_INVALID);
  }

  // updatedAt
  if (alt.updatedAt === undefined || alt.updatedAt === null) {
    errors.push(ERROR_MESSAGES.ALERT_UPDATED_AT_REQUIRED);
  } else if (!isValidTimestamp(alt.updatedAt)) {
    errors.push(ERROR_MESSAGES.ALERT_UPDATED_AT_INVALID);
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

/**
 * ティッカー作成データのバリデーション（POST用）
 *
 * @param data - 作成データ（Symbol, Name, ExchangeID）
 * @returns バリデーション結果
 */
export function validateTickerCreateData(data: unknown): ValidationResult {
  const errors: string[] = [];

  // null/undefined チェック
  if (data === null || data === undefined) {
    return { valid: false, errors: ['ティッカーデータが指定されていません'] };
  }

  // 型チェック
  if (typeof data !== 'object') {
    return { valid: false, errors: ['ティッカーデータが不正です'] };
  }

  const d = data as Partial<{ symbol: string; name: string; exchangeId: string }>;

  // Symbol
  if (!d.symbol || typeof d.symbol !== 'string') {
    errors.push(ERROR_MESSAGES.TICKER_SYMBOL_REQUIRED);
  } else if (!/^[A-Z0-9]{1,20}$/.test(d.symbol)) {
    errors.push(ERROR_MESSAGES.TICKER_SYMBOL_INVALID_FORMAT);
  }

  // Name
  if (!d.name || typeof d.name !== 'string' || !isNonEmptyString(d.name)) {
    errors.push(ERROR_MESSAGES.TICKER_NAME_REQUIRED);
  } else if (d.name.length > 200) {
    errors.push(ERROR_MESSAGES.TICKER_NAME_TOO_LONG);
  }

  // ExchangeID
  if (!d.exchangeId || typeof d.exchangeId !== 'string' || !isNonEmptyString(d.exchangeId)) {
    errors.push(ERROR_MESSAGES.TICKER_EXCHANGE_ID_REQUIRED);
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

/**
 * ティッカー更新データのバリデーション（PUT用）
 *
 * @param data - 更新データ（name のみ）
 * @returns バリデーション結果
 */
export function validateTickerUpdateData(data: unknown): ValidationResult {
  const errors: string[] = [];

  // null/undefined チェック
  if (data === null || data === undefined) {
    return { valid: false, errors: ['ティッカーデータが指定されていません'] };
  }

  // 型チェック
  if (typeof data !== 'object') {
    return { valid: false, errors: ['ティッカーデータが不正です'] };
  }

  const d = data as Partial<{ name: string }>;

  // 更新フィールドがない場合
  if (d.name === undefined) {
    errors.push('更新する内容を指定してください');
  } else {
    // Name
    if (typeof d.name !== 'string' || !isNonEmptyString(d.name)) {
      errors.push(ERROR_MESSAGES.TICKER_NAME_REQUIRED);
    } else if (d.name.length > 200) {
      errors.push(ERROR_MESSAGES.TICKER_NAME_TOO_LONG);
    }
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}
