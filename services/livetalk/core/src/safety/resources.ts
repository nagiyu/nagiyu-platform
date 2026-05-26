/**
 * 日本のセーフティリソース定義（Phase 2d / Issue #3250）。
 *
 * リソース情報の更新時はこのファイルのみを修正する。
 * URL・電話番号の正確性を定期的に確認すること。
 *
 * @see Issue #3250 実装上の注意点
 */

import type { SafetyResource } from './types.js';

export const SAFETY_RESOURCES: SafetyResource[] = [
  {
    name: 'いのちの電話',
    description: '24 時間対応の電話相談窓口',
    phone: '0570-783-556',
    url: 'https://www.inochinodenwa.org/',
  },
  {
    name: 'よりそいホットライン',
    description: 'さまざまな悩み相談（24 時間、無料）',
    phone: '0120-279-338',
    url: 'https://www.since2011.net/yorisoi/',
  },
  {
    name: 'TELL Lifeline',
    description: '英語・日本語対応の相談窓口',
    phone: '03-5774-0992',
    url: 'https://telljp.com/lifeline/',
  },
  {
    name: '緊急時（救急・警察）',
    description: '生命の危機がある場合',
    phone: '119',
    url: null,
  },
];
