import { docClient, TABLE_NAME } from './client.js';
import { createVideoRepository, createUserSettingRepository } from '../repositories/factory.js';
import type { VideoRepository } from '../repositories/video.repository.interface.js';
import type { UserSettingRepository } from '../repositories/user-setting.repository.interface.js';
import type {
  VideoBasicInfo,
  UserVideoSetting,
  CreateVideoBasicInfoInput,
  CreateUserSettingInput,
  VideoSettingUpdate,
} from '../types/index.js';

// Repository インスタンスの遅延作成
// 環境変数 USE_IN_MEMORY_DB により、DynamoDB または InMemory 実装を切り替える
let videoRepositoryInstance: VideoRepository | null = null;
let userSettingRepositoryInstance: UserSettingRepository | null = null;

function getVideoRepository(): VideoRepository {
  if (!videoRepositoryInstance) {
    videoRepositoryInstance = createVideoRepository(docClient, TABLE_NAME);
  }
  return videoRepositoryInstance;
}

function getUserSettingRepository(): UserSettingRepository {
  if (!userSettingRepositoryInstance) {
    userSettingRepositoryInstance = createUserSettingRepository(docClient, TABLE_NAME);
  }
  return userSettingRepositoryInstance;
}

/**
 * 動画基本情報（VIDEO エンティティ）の操作
 */

/**
 * 動画基本情報を作成
 * @throws ConditionalCheckFailedException (AWS SDK) - 既に同じ videoId の動画が存在する場合
 */
export async function createVideoBasicInfo(
  input: CreateVideoBasicInfoInput
): Promise<VideoBasicInfo> {
  const entity = await getVideoRepository().create(input);
  return entity as VideoBasicInfo;
}

/**
 * 動画基本情報を取得
 * @returns 動画基本情報、存在しない場合は null
 */
export async function getVideoBasicInfo(videoId: string): Promise<VideoBasicInfo | null> {
  const entity = await getVideoRepository().getById(videoId);
  return entity as VideoBasicInfo | null;
}

/**
 * 複数の動画基本情報を一括取得
 * @param videoIds 動画IDの配列（最大100件）
 * @returns 動画基本情報の配列（存在するもののみ）
 */
export async function batchGetVideoBasicInfo(videoIds: string[]): Promise<VideoBasicInfo[]> {
  const entities = await getVideoRepository().batchGet(videoIds);
  return entities as VideoBasicInfo[];
}

/**
 * ユーザー設定（USER_SETTING エンティティ）の操作
 */

/**
 * ユーザー設定を作成
 * @throws ConditionalCheckFailedException (AWS SDK) - 既に存在する場合
 */
export async function createUserVideoSetting(
  input: CreateUserSettingInput
): Promise<UserVideoSetting> {
  const entity = await getUserSettingRepository().create(input);
  return entity as UserVideoSetting;
}

/**
 * ユーザー設定を作成または更新
 * 既存の設定がある場合は更新、ない場合は新規作成
 * @returns 作成または更新されたユーザー設定
 */
export async function upsertUserVideoSetting(
  input: CreateUserSettingInput
): Promise<UserVideoSetting> {
  const entity = await getUserSettingRepository().upsert(input);
  return entity as UserVideoSetting;
}

/**
 * ユーザー設定を取得
 * @returns ユーザー設定、存在しない場合は null
 */
export async function getUserVideoSetting(
  userId: string,
  videoId: string
): Promise<UserVideoSetting | null> {
  const entity = await getUserSettingRepository().getById(userId, videoId);
  return entity as UserVideoSetting | null;
}

/**
 * ユーザー設定を更新
 * @throws Error - 更新する項目が指定されていない場合
 * @throws ConditionalCheckFailedException (AWS SDK) - 設定が存在しない場合
 */
export async function updateUserVideoSetting(
  userId: string,
  videoId: string,
  update: VideoSettingUpdate
): Promise<UserVideoSetting> {
  const entity = await getUserSettingRepository().update(userId, videoId, update);
  return entity as UserVideoSetting;
}

/**
 * ユーザーの全動画設定を取得
 * @param userId ユーザーID
 * @param options ページネーションオプション
 * @returns 動画設定の配列と次ページのキー
 */
export async function listUserVideoSettings(
  userId: string,
  options?: {
    limit?: number;
    lastEvaluatedKey?: Record<string, string>;
  }
): Promise<{ settings: UserVideoSetting[]; lastEvaluatedKey?: Record<string, string> }> {
  const limit = options?.limit || 100;
  const cursor = options?.lastEvaluatedKey
    ? Buffer.from(JSON.stringify(options.lastEvaluatedKey)).toString('base64')
    : undefined;

  const result = await getUserSettingRepository().getByUserId(userId, {
    limit,
    cursor,
  });

  const lastEvaluatedKey = result.nextCursor
    ? JSON.parse(Buffer.from(result.nextCursor, 'base64').toString('utf-8'))
    : undefined;

  return {
    settings: result.items as UserVideoSetting[],
    lastEvaluatedKey,
  };
}

/**
 * ユーザー設定を削除
 */
export async function deleteUserVideoSetting(userId: string, videoId: string): Promise<void> {
  await getUserSettingRepository().delete(userId, videoId);
}

/**
 * ユーザーの動画一覧を取得（フィルタリング・ページネーション対応）
 * @param userId ユーザーID
 * @param options フィルタとページネーションのオプション
 * - limit 未指定時は、フィルタ後の動画を全件返します
 * @returns 動画データの配列と総件数
 *
 * @remarks
 * 現在の実装では、フィルタリングとoffset/limit方式のページネーションを実現するため、
 * DynamoDBから全ユーザー設定を取得してメモリ内で処理しています。
 * これは以下の理由によります：
 * - DynamoDBのQueryでは複数属性での効率的なフィルタリングができない
 * - offset/limit方式のページネーションにはフィルタ後の総件数が必要
 *
 * データ量が増加した場合は、以下の対策を検討してください：
 * - GSI（Global Secondary Index）の追加
 * - ElasticSearchなどの検索エンジンの導入
 * - キャッシュ層の追加
 */
export async function listVideosWithSettings(
  userId: string,
  options?: {
    limit?: number;
    offset?: number;
    isFavorite?: boolean;
    isSkip?: boolean;
  }
): Promise<{ videos: Array<VideoBasicInfo & { userSetting?: UserVideoSetting }>; total: number }> {
  const limit = options?.limit;
  const offset = options?.offset ?? 0;
  const isFavorite = options?.isFavorite;
  const isSkip = options?.isSkip;

  // DynamoDBからユーザーの全設定を取得
  // フィルタリングのため、全件取得が必要
  const allSettings: UserVideoSetting[] = [];
  let lastKey: Record<string, string> | undefined;

  do {
    const result = await listUserVideoSettings(userId, {
      limit: 100,
      lastEvaluatedKey: lastKey,
    });
    allSettings.push(...result.settings);
    lastKey = result.lastEvaluatedKey;
  } while (lastKey);

  // ユーザー設定が存在しない場合も、全ユーザー共通の動画基本情報を返す
  if (allSettings.length === 0) {
    if (isFavorite === true || isSkip === true) {
      return {
        videos: [],
        total: 0,
      };
    }

    const allVideos = await getVideoRepository().listAll();
    const paginatedVideos =
      limit === undefined ? allVideos.slice(offset) : allVideos.slice(offset, offset + limit);

    return {
      videos: paginatedVideos,
      total: allVideos.length,
    };
  }

  // フィルタリング適用
  let filteredSettings = allSettings;

  if (isFavorite !== undefined) {
    filteredSettings = filteredSettings.filter((setting) => setting.isFavorite === isFavorite);
  }

  if (isSkip !== undefined) {
    filteredSettings = filteredSettings.filter((setting) => setting.isSkip === isSkip);
  }

  // 総件数
  const total = filteredSettings.length;

  // ページネーション適用
  const paginatedSettings =
    limit === undefined
      ? filteredSettings.slice(offset)
      : filteredSettings.slice(offset, offset + limit);

  // 動画基本情報を一括取得
  const videoIds = paginatedSettings.map((setting) => setting.videoId);
  const basicInfos = videoIds.length > 0 ? await batchGetVideoBasicInfo(videoIds) : [];

  // 動画基本情報とユーザー設定をマージ
  const basicInfoMap = new Map(basicInfos.map((info) => [info.videoId, info]));

  const videos = paginatedSettings
    .map((setting) => {
      const basicInfo = basicInfoMap.get(setting.videoId);
      if (!basicInfo) {
        // 動画基本情報が存在しない場合はスキップ
        return null;
      }
      return {
        ...basicInfo,
        userSetting: setting,
      };
    })
    .filter((video) => video !== null) as Array<VideoBasicInfo & { userSetting: UserVideoSetting }>;

  return {
    videos,
    total,
  };
}
