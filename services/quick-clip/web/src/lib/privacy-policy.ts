import { privacyPolicySections } from '@nagiyu/ui';
import type { LegalSection } from '@nagiyu/ui';

/** 共通の文面で、差し替え・挿入の位置を決める節の見出し */
export const SECTION_TITLES = {
  COOKIE_SETTINGS: 'Cookieの設定について',
  DATA_HANDLING: 'データの取り扱い',
} as const;

/** 利用回数の制限で Cookie と IP アドレスを使うことの説明。共通の文面には載せず、このサービスだけに足す */
export const USAGE_LIMIT_PRIVACY_SECTION: LegalSection = {
  title: 'さくっとクリップの利用回数の制限について',
  contents: [
    {
      mainContent:
        'さくっとクリップでは、無料でご利用いただける回数を管理するため、ログインしていない方のブラウザに、当サービスが発行するランダムな識別子を Cookie として保存します。この識別子は利用回数を数えるためだけに使い、氏名などの個人を特定する情報とは結び付けません。',
    },
    {
      mainContent:
        '同じ接続元からの過度な利用を防ぐため、アクセス元の IP アドレスを利用します。IP アドレスはそのままでは保存せず、日ごとに変わる値と組み合わせて変換したうえで記録し、数日以内に自動で削除します。',
    },
    {
      mainContent: 'ログインしている方の利用回数は、アカウントごとに記録します。',
    },
    {
      mainContent:
        'Cookie を受け付けない設定の場合も、IP アドレスによる上限の範囲でご利用いただけます。',
    },
  ],
};

/**
 * 共通の「データの取り扱い」は「すべてブラウザ内で処理され、サーバーに送信されない」と述べるが、
 * このサービスは動画をサーバーで処理し、AI 解析では OpenAI の API に送るため、実態に合わせて差し替える。
 */
export const DATA_HANDLING_PRIVACY_SECTION: LegalSection = {
  title: SECTION_TITLES.DATA_HANDLING,
  contents: [
    {
      mainContent:
        'さくっとクリップでは、見どころを抽出するため、アップロードされた動画を当サイトのサーバー (Amazon Web Services) で処理します。アップロードされた動画と処理の結果は、作成から 24 時間で利用できなくなり、その後自動的に削除します。AI 解析を行う場合は、文字起こしと感情分析のため、動画の音声と文字起こしの結果を OpenAI の API に送信します。',
    },
  ],
};

/**
 * 共通のプライバシーポリシーに、このサービス固有の変更を加えたもの。
 * 「データの取り扱い」は差し替え、利用回数の制限の節は「Cookieの設定について」の直後に足す。
 * 見出しが共通の文面から無くなると変更が効かなくなるため、テストで両方が見つかることを確かめている。
 */
export const quickClipPrivacySections: LegalSection[] = privacyPolicySections.flatMap((section) => {
  if (section.title === SECTION_TITLES.DATA_HANDLING) {
    return [DATA_HANDLING_PRIVACY_SECTION];
  }
  if (section.title === SECTION_TITLES.COOKIE_SETTINGS) {
    return [section, USAGE_LIMIT_PRIVACY_SECTION];
  }
  return [section];
});
