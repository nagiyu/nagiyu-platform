export { handler as learnUserActivityHandler } from './handlers/learn-user-activity.js';
export { learnAllUserActivities } from './usecases/learn-user-activity.usecase.js';
export type {
  LearnAllUserActivitiesParams,
  LearnAllUserActivitiesResult,
} from './usecases/learn-user-activity.usecase.js';

export { handler as notifyHandler } from './handlers/notify.js';
export { notifyAllUsers } from './usecases/notify.usecase.js';
export type { NotifyAllUsersParams, NotifyAllUsersResult } from './usecases/notify.usecase.js';

export { handler as consolidateHandler } from './handlers/consolidate-conversations.js';
export { consolidateAllConversations } from './usecases/consolidate-conversations.usecase.js';
export type {
  ConsolidateAllConversationsParams,
  ConsolidateAllConversationsResult,
} from './usecases/consolidate-conversations.usecase.js';

export { handler as acquireHandler } from './handlers/acquire.js';
export { acquireAllUsers } from './usecases/acquire.usecase.js';
export type { AcquireAllUsersParams, AcquireAllUsersResult } from './usecases/acquire.usecase.js';

// 一回性マイグレーション（旧知識資材 → 新 Topic モデル、手動 invoke 専用、throwaway）
export { handler as migrateHandler } from './handlers/migrate.js';
export { runMigration, MIGRATE_ERROR_MESSAGES } from './usecases/migrate.usecase.js';
export type {
  MigratePayload,
  MigrateResult,
  MigrateScopeReport,
  RunMigrationParams,
} from './usecases/migrate.usecase.js';
