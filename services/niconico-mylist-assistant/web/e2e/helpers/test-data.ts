/**
 * E2E テスト用データヘルパー
 *
 * インメモリDBを使用したテストでのデータ管理を提供する
 */

/**
 * テストデータをクリアする
 *
 * @remarks
 * - beforeEach フックで呼び出してテスト間のデータ独立性を保証
 * - InMemorySingleTableStore に格納されたすべてのデータを削除
 * - DynamoDB実装では使用しない（USE_IN_MEMORY_DB=true の場合のみ有効）
 *
 * @example
 * ```typescript
 * test.beforeEach(async () => {
 *   await clearTestData();
 * });
 * ```
 */
export async function clearTestData(): Promise<void> {
  // 環境変数チェック：インメモリDB使用時のみクリア
  if (process.env.USE_IN_MEMORY_DB !== 'true') {
    console.warn('clearTestData: USE_IN_MEMORY_DB が true でないため、スキップします');
    return;
  }

  // 動的インポートを使用してテスト実行時にのみモジュールを読み込む
  // Playwright の設定読み込みフェーズでは、core パッケージが依存する @nagiyu/aws の
  // ESM exports 解決に失敗するため、テスト実行時（ランタイム）まで遅延させる必要がある
  const { clearInMemoryStore } = await import('@nagiyu/niconico-mylist-assistant-core');
  clearInMemoryStore();
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
