/**
 * お問い合わせページで使用するデータ定数
 *
 * Google フォームを主たる手段として前面に出し、
 * GitHub Issues は技術者向け補助手段として併記する。
 */

export const ERROR_MESSAGES = {
  CONTACT_DATA_NOT_FOUND: 'お問い合わせページのデータが見つかりません',
} as const;

/** Google フォームの URL（運営者公開の正規 URL） */
export const CONTACT_FORM_URL = 'https://forms.gle/oxzHNFBWBpFGNaKm7' as const;

/** GitHub Issues の URL */
export const GITHUB_ISSUES_URL = 'https://github.com/nagiyu/nagiyu-platform/issues' as const;

/**
 * お問い合わせ用途の説明
 */
export type ContactUseCase = {
  /** 用途の見出し */
  title: string;
  /** 詳細説明 */
  description: string;
};

/**
 * Google フォームで受け付けるお問い合わせの用途一覧
 */
export const CONTACT_USE_CASES: ContactUseCase[] = [
  {
    title: '記事の誤り・情報の修正依頼',
    description:
      '技術記事の内容に誤りや古くなった情報があれば、ご指摘いただけると助かります。実装・運用に基づいて確認のうえ改訂します。',
  },
  {
    title: '記事の内容に関する質問・補足',
    description:
      '記事で扱った設計判断や実装について、質問や補足・別のアプローチなどがあればお寄せください。',
  },
  {
    title: 'サイトの不具合',
    description:
      'ページが正しく表示されない・リンクが切れているなど、サイト自体の不具合に気づいた場合はご連絡ください。',
  },
  {
    title: 'その他のお問い合わせ',
    description:
      '上記以外のご連絡もお気軽にどうぞ。個人での運営のため、返信にお時間をいただく場合があります。',
  },
] as const;

/**
 * 注意事項の一覧
 */
export const CONTACT_NOTES: string[] = [
  '個人で運営しているため、すべてのご要望にお応えできるわけではありません。',
  '返信が必要な場合は、フォーム内にご連絡先をご記入ください。',
  '返信までにお時間をいただく場合があります。',
  '技術的なサポートやカスタマイズ対応は承っておりません。',
] as const;
