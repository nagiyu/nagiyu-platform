import { createErrorReporter } from '@nagiyu/aws';

/**
 * バッチ共通の ErrorEvent 報告用レポーター。
 * serviceId を 1 か所に固定し、ファイルごとの指定ゆれを防ぐ。
 */
export const errorReporter = createErrorReporter({ serviceId: 'stock-tracker' });
