// 型定義のエクスポート
export * from './types/index.js';

// Repository パターン実装
// NOTE: Entity types are exported as separate types to avoid naming conflicts with existing types
export type {
  VideoEntity,
  CreateVideoInput as CreateVideoEntityInput,
  VideoKey,
} from './entities/video.entity.js';

export type {
  UserSettingEntity,
  CreateUserSettingInput as CreateUserSettingEntityInput,
  UpdateUserSettingInput,
  UserSettingKey,
} from './entities/user-setting.entity.js';

export * from './repositories/index.js';
export * from './mappers/index.js';

// DynamoDB アクセス層（後方互換性のため残す）
export * from './db/index.js';

// ニコニコ動画 API クライアント
export * from './niconico/index.js';

// 暗号化ユーティリティ
export * from './utils/crypto.js';

// Web Push 通知クライアント (Server-only)
// クライアントサイドで使用する場合は、@nagiyu/niconico-mylist-assistant-core/server からインポートしてください
// export * from './utils/web-push-client.js';
