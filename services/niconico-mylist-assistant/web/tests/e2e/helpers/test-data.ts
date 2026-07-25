/**
 * E2E テスト用データヘルパー
 *
 * インメモリDBを使用したテストでのデータ管理を提供する
 */

/**
 * テストデータをクリアする（API経由）
 *
 * @param request - Playwright の APIRequestContext
 *
 * @remarks
 * - beforeEach フックで呼び出してテスト間のデータ独立性を保証
 * - API経由で全動画を取得し、1件ずつ削除することでサーバー側のデータをクリア
 * - E2Eテストプロセスとサーバープロセスが分離しているため、API経由でのクリアが必須
 *
 * @example
 * ```typescript
 * test.beforeEach(async ({ request }) => {
 *   await clearTestData(request);
 * });
 * ```
 */
export async function clearTestData(request: any): Promise<void> {
  try {
    // 全動画を取得（limit=100で最大100件まで）
    const response = await request.get('/api/videos?limit=100&offset=0');
    if (!response.ok()) {
      console.warn('clearTestData: 動画一覧の取得に失敗しました');
      return;
    }

    const data = await response.json();
    const videos = data.videos || [];

    // 各動画を削除
    for (const video of videos) {
      await request.delete(`/api/videos/${video.videoId}`);
    }

    console.log(`clearTestData: ${videos.length}件の動画を削除しました`);
  } catch (error) {
    console.error('clearTestData error:', error);
  }
}

/**
 * テスト用の動画データを作成
 *
 * @param userId - ユーザーID（デフォルト: 'test-user-id'）
 * @param count - 作成する動画の数（デフォルト: 5）
 * @param options - オプション設定
 * @returns 作成された動画IDの配列
 *
 * @remarks
 * - インメモリDBに直接動画データとユーザー設定を作成
 * - 各動画には連番のIDが付与される（sm1, sm2, ...）
 * - テストケース内で必要なデータを事前にセットアップするために使用
 *
 * @example
 * ```typescript
 * test('should display video list', async ({ page }) => {
 *   await clearTestData();
 *   await seedVideoData('test-user-id', 10);
 *   await page.goto('/mylist');
 *   // テストコード
 * });
 * ```
 */
export async function seedVideoData(
  userId: string = 'test-user-id',
  count: number = 5,
  options?: {
    favoriteCount?: number; // お気に入りに設定する数
    skipCount?: number; // スキップに設定する数
    startId?: number; // 開始ID（デフォルト: 1）
  }
): Promise<string[]> {
  // 環境変数チェック：インメモリDB使用時のみ実行
  if (process.env.USE_IN_MEMORY_DB !== 'true') {
    console.warn('seedVideoData: USE_IN_MEMORY_DB が true でないため、スキップします');
    return [];
  }

  const { createVideoBasicInfo, upsertUserVideoSetting } =
    await import('@nagiyu/niconico-mylist-assistant-core');

  const startId = options?.startId ?? 1;
  const videoIds: string[] = [];

  for (let i = 0; i < count; i++) {
    const videoId = `sm${startId + i}`;
    videoIds.push(videoId);

    // 動画基本情報を作成
    await createVideoBasicInfo({
      videoId,
      title: `テスト動画 ${startId + i}`,
      thumbnailUrl: `https://example.com/thumbnail/${videoId}.jpg`,
      length: '5:30',
    });

    // ユーザー設定を作成
    const isFavorite = options?.favoriteCount ? i < options.favoriteCount : false;
    const isSkip = options?.skipCount ? i < options.skipCount : false;

    await upsertUserVideoSetting({
      userId,
      videoId,
      isFavorite,
      isSkip,
    });
  }

  return videoIds;
}

/**
 * テストデータをシードする（後方互換性のため残す）
 *
 * @remarks
 * - 現在は空の実装
 * - seedVideoData() の使用を推奨
 *
 * @example
 * ```typescript
 * test.beforeEach(async () => {
 *   await clearTestData();
 *   await seedTestData();
 * });
 * ```
 */
export async function seedTestData(): Promise<void> {
  // 将来的な拡張用
  // 共通のテストデータが必要になった場合にここに実装
}
