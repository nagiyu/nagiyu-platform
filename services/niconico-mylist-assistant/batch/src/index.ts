/**
 * AWS Batch エントリーポイント
 *
 * ニコニコ動画マイリスト自動登録バッチジョブ
 */

import {
  decrypt,
  updateBatchJob,
  getBatchJob,
  validateUserSession,
} from '@nagiyu/niconico-mylist-assistant-core';
import type { CryptoConfig } from '@nagiyu/niconico-mylist-assistant-core';
import { createErrorReporter, reportErrorEvent, withErrorReporting } from '@nagiyu/aws';
import { sendWebPushNotification, getVapidConfig } from '@nagiyu/common/push';
import { executeMylistRegistration } from './playwright-automation.js';
import { createBatchCompletionPayload } from './lib/web-push-client.js';
import { determineBatchJobStatus } from './lib/job-status.js';
import { getTimestamp, toErrorMessage } from '@nagiyu/common';
import type { PushSubscription } from '@nagiyu/common';
import { ERROR_MESSAGES } from './constants.js';
import { getJobParameters, readEnvironmentVariables } from './lib/job-environment.js';
import { MylistRegistrationJobParams } from './types.js';

const errorReporter = createErrorReporter({ serviceId: 'niconico-mylist-assistant' });

/**
 * user_session を復号化する
 *
 * @param encryptedData - 暗号化された user_session データ（JSON文字列）
 * @param config - 暗号化設定
 * @returns 復号化された user_session 値
 */
async function decryptUserSession(encryptedData: string, config: CryptoConfig): Promise<string> {
  console.log('user_session を復号化中...');

  try {
    // JSON文字列をパースして EncryptedData オブジェクトを取得
    let encrypted;
    try {
      encrypted = JSON.parse(encryptedData);
    } catch (parseError) {
      throw new Error(
        `暗号化 user_session の JSON 形式が不正です: ${parseError instanceof Error ? parseError.message : String(parseError)}`,
        { cause: parseError }
      );
    }

    // core/crypto.ts の decrypt 関数を使用して復号化
    const userSession = await decrypt(encrypted, config);

    console.log('user_session の復号化に成功しました');
    return userSession;
  } catch (error) {
    console.error('user_session の復号化に失敗しました:', error);
    await errorReporter.report('user_session 復号化失敗', error, { severity: 'critical' });
    throw new Error(`${ERROR_MESSAGES.DECRYPTION_FAILED}: ${toErrorMessage(error)}`, {
      cause: error,
    });
  }
}

/**
 * バッチ処理のメイン関数
 */
async function main() {
  // 開始ログ
  console.log('========================================');
  console.log('ニコニコマイリスト登録バッチ開始');
  console.log(`開始時刻: ${getTimestamp()}`);
  console.log('========================================');

  let params: MylistRegistrationJobParams | null = null;
  let pushSubscription: PushSubscription | undefined;

  const context: Record<string, unknown> = {};

  await withErrorReporting(
    {
      serviceId: 'niconico-mylist-assistant',
      severity: 'critical',
      title: 'バッチジョブ全体の失敗',
      // パラメータ取得前の失敗でも報告できるよう、後から jobId / userId を書き足す参照渡しの object にする
      context,
      // 異常終了コードを AWS Batch に伝え、ジョブを失敗扱いにする
      exitOnError: true,
      onError: async (error) => {
        console.error('');
        console.error('========================================');
        console.error('バッチジョブが失敗しました');
        console.error(`エラー時刻: ${getTimestamp()}`);
        console.error('エラー詳細:', error);
        console.error('========================================');

        // ジョブステータスを FAILED に更新
        if (params?.jobId && params?.userId) {
          try {
            await updateBatchJob(params.jobId, params.userId, {
              status: 'FAILED',
              result: {
                registeredCount: 0,
                failedCount: 0,
                totalCount: 0,
                errorMessage: toErrorMessage(error),
              },
              completedAt: Date.now(),
            });
            console.log('ジョブステータスを FAILED に更新しました');
          } catch (updateError) {
            console.error('ジョブステータス更新に失敗しました (FAILED):', updateError);
          }
        }
      },
    },
    async () => {
      // 環境変数の読み取り
      const env = readEnvironmentVariables();

      // ジョブパラメータの取得
      params = getJobParameters();
      // 失敗時の報告に jobId / userId を載せるため、取得できた時点で context へ反映する
      context.jobId = params.jobId;
      context.userId = params.userId;

      // ジョブ情報を取得（pushSubscription を取得するため）
      // NOTE: pushSubscription は環境変数として渡さない理由:
      // 1. AWS Batch 環境変数にはサイズ制限がある
      // 2. Subscription エンドポイントや鍵情報は大きく、環境変数には不適切
      // 3. DynamoDB から取得することで、最新の情報を確実に取得できる
      if (params.jobId) {
        try {
          const job = await getBatchJob(params.jobId, params.userId);
          if (job?.pushSubscription) {
            pushSubscription = job.pushSubscription;
            console.log('Push サブスクリプション情報を取得しました');
          }
        } catch (error) {
          console.warn('ジョブ情報の取得に失敗しました:', error);
          // Push通知情報が取得できなくてもジョブは続行
        }
      }

      // ジョブステータスを RUNNING に更新
      if (params.jobId) {
        try {
          await updateBatchJob(params.jobId, params.userId, {
            status: 'RUNNING',
          });
          console.log('ジョブステータスを RUNNING に更新しました');
        } catch (error) {
          console.warn('ジョブステータス更新に失敗しました (RUNNING):', error);
          // 更新失敗してもジョブは続行
        }
      }

      // 暗号化設定の作成
      const cryptoConfig: CryptoConfig = {
        secretName: env.encryptionSecretName,
        region: env.awsRegion,
      };

      // user_session の復号化
      const userSession = await decryptUserSession(params.encryptedUserSession, cryptoConfig);

      // user_session の有効性を検証（実行直前）
      console.log('user_session の有効性を検証中...');
      const sessionValidationResult = await validateUserSession(userSession);

      if (sessionValidationResult === 'invalid') {
        // セッションが無効の場合は即失敗
        const invalidMessage = ERROR_MESSAGES.SESSION_INVALID;
        console.error(invalidMessage);

        await reportErrorEvent({
          serviceId: 'niconico-mylist-assistant',
          severity: 'error',
          title: 'user_session 無効',
          message: invalidMessage,
          context: {
            jobId: params.jobId,
            userId: params.userId,
          },
        });

        // ジョブステータスを FAILED に更新
        if (params.jobId) {
          try {
            await updateBatchJob(params.jobId, params.userId, {
              status: 'FAILED',
              result: {
                registeredCount: 0,
                failedCount: 0,
                totalCount: 0,
                errorMessage: invalidMessage,
              },
              completedAt: Date.now(),
            });
          } catch (updateError) {
            console.error('ジョブステータス更新に失敗しました (FAILED):', updateError);
          }
        }

        // Push 通知で失敗を通知
        if (pushSubscription && params.jobId) {
          try {
            const notificationPayload = createBatchCompletionPayload(params.jobId, 0, 0, 0);
            await sendWebPushNotification(pushSubscription, notificationPayload, getVapidConfig());
          } catch (notifyError) {
            console.error('失敗通知の送信中にエラーが発生しました:', notifyError);
          }
        }

        process.exit(1);
      } else if (sessionValidationResult === 'unknown') {
        // 判定不能の場合はログのみで続行（ニコニコ側の一時障害の可能性）
        console.warn(
          'user_session の検証で判定不能 (unknown) でした。ニコニコ側の一時障害の可能性があるため処理を続行します。'
        );
      } else {
        console.log('user_session の検証に成功しました（有効）');
      }

      console.log('');
      console.log('Playwright自動化処理を開始します...');
      console.log('');

      // マイリスト登録処理の実行
      const result = await executeMylistRegistration(
        userSession,
        params.mylistName,
        params.videoIds
      );

      console.log('');
      console.log('=== 登録結果 ===');
      console.log(`成功: ${result.successVideoIds.length}件`);
      console.log(`失敗: ${result.failedVideoIds.length}件`);

      if (result.failedVideoIds.length > 0) {
        console.log('失敗した動画ID:', result.failedVideoIds.join(', '));
      }

      if (result.errorMessage) {
        console.error('エラーメッセージ:', result.errorMessage);
      }

      console.log('================');

      // 登録結果からジョブの最終ステータスを確定する（DB 書き込み前に決定）
      const finalStatus = determineBatchJobStatus(
        result.successVideoIds.length,
        result.failedVideoIds.length
      );

      // ジョブステータスを確定ステータスで更新
      if (params.jobId) {
        try {
          await updateBatchJob(params.jobId, params.userId, {
            status: finalStatus,
            result: {
              registeredCount: result.successVideoIds.length,
              failedCount: result.failedVideoIds.length,
              totalCount: result.successVideoIds.length + result.failedVideoIds.length,
              errorMessage: result.errorMessage,
            },
            completedAt: Date.now(),
          });
          console.log(`ジョブステータスを ${finalStatus} に更新しました`);

          // Web Push 通知を送信
          if (pushSubscription) {
            try {
              console.log('バッチ完了通知を送信中...');
              const notificationPayload = createBatchCompletionPayload(
                params.jobId,
                result.successVideoIds.length,
                result.failedVideoIds.length,
                result.successVideoIds.length + result.failedVideoIds.length
              );
              const notificationSent = await sendWebPushNotification(
                pushSubscription,
                notificationPayload,
                getVapidConfig()
              );
              if (notificationSent) {
                console.log('バッチ完了通知を送信しました');
              } else {
                console.warn('バッチ完了通知の送信に失敗しました');
              }
            } catch (error) {
              console.error('バッチ完了通知の送信中にエラーが発生しました:', error);
              // 通知送信の失敗はジョブの成否に影響しない
            }
          } else {
            console.log('Push サブスクリプション情報がないため、通知をスキップします');
          }
        } catch (error) {
          console.error(`ジョブステータス更新に失敗しました (${finalStatus}):`, error);
          // 更新失敗してもジョブ自体は続行
        }
      }

      // 完了ログ
      console.log('');
      console.log('========================================');
      console.log('バッチ処理完了');
      console.log(`完了時刻: ${getTimestamp()}`);
      console.log('========================================');

      // DB に FAILED を書いた後、全件失敗の場合は異常終了する
      if (finalStatus === 'FAILED') {
        console.error('全ての動画の登録に失敗しました');
        await reportErrorEvent({
          serviceId: 'niconico-mylist-assistant',
          severity: 'critical',
          title: 'バッチジョブ全失敗',
          message: result.errorMessage ?? '全ての動画の登録に失敗しました',
          context: {
            jobId: params?.jobId,
            userId: params?.userId,
            failedCount: result.failedVideoIds.length,
            errorMessage: result.errorMessage,
          },
        });
        process.exit(1);
      }
    }
  );
}

// エントリーポイント
main().catch((error) => {
  console.error('予期しないエラーが発生しました:', error);
  process.exit(1);
});
