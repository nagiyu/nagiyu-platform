/**
 * 特定商取引法に基づく表記の中身。
 * 課金を受けるサービスで表記が食い違わないよう、共通のデータとして持つ。
 */

import type { CommercialTransactionItem } from '../types/legal';

/** 「プランのページ」へのリンクにする語。販売価格の本文に含まれる */
export const PLANS_LINK_TEXT = 'プランのページ';

/** 開示を請求に応じて行う項目の本文 */
const DISCLOSE_ON_REQUEST = '請求があれば遅滞なく開示いたします。';

export const commercialTransactionItems: CommercialTransactionItem[] = [
  { label: '販売事業者', value: DISCLOSE_ON_REQUEST },
  { label: '運営', value: 'なぎゆー' },
  { label: '運営責任者', value: DISCLOSE_ON_REQUEST },
  { label: '所在地', value: DISCLOSE_ON_REQUEST },
  { label: '電話番号', value: DISCLOSE_ON_REQUEST },
  { label: 'メールアドレス', value: 'otonagiyu@gmail.com', linkKind: 'mailto' },
  {
    label: '販売価格',
    value: `各プランの価格 (税込) は、${PLANS_LINK_TEXT}に表示しています。`,
    linkText: PLANS_LINK_TEXT,
    linkKind: 'plans',
  },
  {
    label: '商品代金以外の必要料金',
    value: 'インターネットの接続に必要な通信料は、お客様のご負担となります。',
  },
  { label: '支払方法', value: 'クレジットカード (Apple Pay / Google Pay を含む)' },
  {
    label: '支払時期',
    value: '申し込み時に初回分をお支払いいただき、以降は契約の更新日ごとに自動で請求します。',
  },
  { label: '提供時期', value: 'お支払いの完了後、直ちにご利用いただけます。' },
  {
    label: '契約期間・自動更新',
    value: '1 か月ごとの定期契約で、解約しない限り自動で更新されます。',
  },
  {
    label: '解約の方法',
    value:
      'プランのページの「契約を管理」から、いつでも解約できます。解約後も、支払い済みの期間の終わりまでご利用いただけます。次の更新日以降の請求は発生しません。',
  },
  {
    label: '返品・返金',
    value:
      'デジタルサービスの性質上、お支払い後の返金は原則としていたしません。期間の途中で解約した場合も、日割りでの返金はいたしません。ただし、当方の責による不具合で本サービスをご利用いただけなかった場合は、個別にご相談に応じます。',
  },
  { label: '動作環境', value: '最新版の主要なブラウザ (Chrome / Safari / Edge / Firefox)' },
];
