import { ForbiddenView } from './ForbiddenContent';

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
 * 403（権限なし）時の導線付きページ（/forbidden）。サーバーコンポーネント。
 *
 * ミドルウェアが認証済みユーザーの権限不足を検出したとき、このページへリダイレクトする。
 * `from` クエリパラメータには元のパス（pathname + search）が格納される。
 * ユーザーは「アクセスを更新」または「再ログイン」で権限取得後の利用再開が可能。
 *
 * NEXT_PUBLIC_AUTH_URL はサーバーのランタイム env から解決し、client の ForbiddenView へ
 * prop として渡す。client component 内で参照するとビルド時インライン化で空文字になり、
 * AccessDeniedView の導線が相対 URL になって失敗するため（admin の server component と同方式）。
 */
export default function ForbiddenPage() {
  return <ForbiddenView authUrl={process.env.NEXT_PUBLIC_AUTH_URL ?? ''} />;
}
