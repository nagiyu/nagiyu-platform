import { HomePageClient } from './HomePageClient';

/**
 * このページを動的レンダリングに強制する。
 *
 * NEXT_PUBLIC_AUTH_URL は Docker ビルド時には未設定のため、サーバーバンドル内では
 * `process.env.NEXT_PUBLIC_AUTH_URL` がランタイム読み取りの式として保持される。
 * しかし静的プリレンダ（○ Static）のままだと、この式がビルド時に空文字で評価され、
 * authUrl="" が静的 HTML に固定されてしまい、ECS タスク定義のランタイム env を拾えない。
 * 動的レンダリングを強制することで、リクエスト時にランタイム env を読み込ませる
 * （session/cookie 依存で動的になる admin の server component と同じ実行条件に揃える）。
 */
export const dynamic = 'force-dynamic';

/**
 * ページのエントリポイント（サーバーコンポーネント）。
 *
 * authUrl の解決は layout.tsx（LiveTalkHeader 経由）へ移設したため、
 * このページでは authUrl を HomePageClient に渡す必要がなくなった。
 */
export default function Page() {
  return <HomePageClient />;
}
