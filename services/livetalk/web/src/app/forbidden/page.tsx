import { AccessDeniedView } from '@nagiyu/ui';

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
 * 権限なし時の導線付きページ（/forbidden）。サーバーコンポーネント。
 *
 * ミドルウェアが認証済みユーザーの権限不足を検出したとき、URL を変えずにこのページへ
 * rewrite する。戻り先は AccessDeniedView がボタン押下時の現在の URL から解決する。
 *
 * NEXT_PUBLIC_AUTH_URL はサーバーのランタイム env から解決して渡す。client component 内で
 * 参照するとビルド時インライン化で空文字になり、AccessDeniedView の導線が相対 URL になって
 * 失敗するため。
 */
export default function ForbiddenPage() {
  return <AccessDeniedView authUrl={process.env.NEXT_PUBLIC_AUTH_URL ?? ''} />;
}
