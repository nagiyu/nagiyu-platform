import { HomePageClient } from './HomePageClient';

/**
 * ページのエントリポイント（サーバーコンポーネント）。
 *
 * NEXT_PUBLIC_AUTH_URL はサーバーのランタイム env から解決する。
 * client component 内で参照するとビルド時インライン化で空文字になるため、
 * サーバーで解決して prop として渡す（admin の server component と同方式）。
 *
 * これにより ECS タスク定義のランタイム env が正しくサインアウト URL に反映される。
 */
export default function Page() {
  return <HomePageClient authUrl={process.env.NEXT_PUBLIC_AUTH_URL ?? ''} />;
}
