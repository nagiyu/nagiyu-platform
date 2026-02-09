/**
 * AWS Batch エントリーポイント
 *
 * ニコニコ動画マイリスト自動登録バッチジョブ
 */

import { decrypt, updateBatchJob } from '@nagiyu/niconico-mylist-assistant-core';
import type { CryptoConfig } from '@nagiyu/niconico-mylist-assistant-core';
import { executeMylistRegistration } from './playwright-automation.js';
import { ERROR_MESSAGES, TIMEOUTS, TWO_FACTOR_AUTH_POLL_INTERVAL } from './constants.js';
import { getTimestamp, generateDefaultMylistName, sleep } from './utils.js';
import { MylistRegistrationJobParams } from './types.js';

/**
 * 環境変数を読み取る
 */
function readEnvironmentVariables(): {
  dynamodbTableName: string;
  encryptionSecretName: string;
  awsRegion: string;
  nodeEnv: string;
} {
  const dynamodbTableName = process.env.DYNAMODB_TABLE_NAME || '';
  const encryptionSecretName = process.env.ENCRYPTION_SECRET_NAME || '';
  const awsRegion = process.env.AWS_REGION || 'us-east-1';
  const nodeEnv = process.env.NODE_ENV || 'development';

  console.log('=== 環境変数 ===');
  console.log(`DYNAMODB_TABLE_NAME: ${dynamodbTableName || '(not set)'}`);
  console.log(
    `ENCRYPTION_SECRET_NAME: ${encryptionSecretName ? encryptionSecretName : '(not set)'}`
  );
  console.log(`AWS_REGION: ${awsRegion}`);
  console.log(`NODE_ENV: ${nodeEnv}`);
  console.log('================');

  return { dynamodbTableName, encryptionSecretName, awsRegion, nodeEnv };
}

/**
 * ジョブパラメータを環境変数から取得する
 * 注: 本来はAWS Batchのジョブパラメータとして渡される
 */
function getJobParameters(): MylistRegistrationJobParams {
  const userId = process.env.USER_ID || '';
  const niconicoEmail = process.env.NICONICO_EMAIL || '';
  const encryptedPassword = process.env.ENCRYPTED_PASSWORD || '';
  const mylistName = process.env.MYLIST_NAME || generateDefaultMylistName();
  const videoIdsJson = process.env.VIDEO_IDS || '[]';
  // AWS Batch が自動的に設定する環境変数からジョブIDを取得
  const jobId = process.env.AWS_BATCH_JOB_ID || '';

  let videoIds: string[] = [];
  try {
    videoIds = JSON.parse(videoIdsJson);
  } catch {
    throw new Error(`${ERROR_MESSAGES.INVALID_PARAMETERS}: VIDEO_IDS`);
  }

  if (!userId || !niconicoEmail || !encryptedPassword || videoIds.length === 0) {
    throw new Error(ERROR_MESSAGES.INVALID_PARAMETERS);
  }

  if (!jobId) {
    console.warn('警告: AWS_BATCH_JOB_ID が設定されていません');
  }

  console.log('=== ジョブパラメータ ===');
  console.log(`ジョブID: ${jobId || '(not set)'}`);
  console.log(`ユーザーID: ${userId}`);
  console.log(`メールアドレス: ${niconicoEmail}`);
  console.log(`マイリスト名: ${mylistName}`);
  console.log(`動画数: ${videoIds.length}`);
  console.log('========================');

  return {
    jobId,
    userId,
    niconicoEmail,
    encryptedPassword,
    mylistName,
    videoIds,
  };
}

/**
 * パスワードを復号化する
 *
 * @param encryptedData - 暗号化されたパスワードデータ（JSON文字列）
 * @param config - 暗号化設定
 * @returns 復号化されたパスワード
 */
async function decryptPassword(encryptedData: string, config: CryptoConfig): Promise<string> {
  console.log('パスワードを復号化中...');

  try {
    // JSON文字列をパースして EncryptedData オブジェクトを取得
    let encrypted;
    try {
      encrypted = JSON.parse(encryptedData);
    } catch (parseError) {
      throw new Error(
        `暗号化パスワードのJSON形式が不正です: ${parseError instanceof Error ? parseError.message : String(parseError)}`
      );
    }

    // core/crypto.ts の decrypt 関数を使用して復号化
    const password = await decrypt(encrypted, config);

    console.log('パスワードの復号化に成功しました');
    return password;
  } catch (error) {
    console.error('パスワードの復号化に失敗しました:', error);
    throw new Error(
      `${ERROR_MESSAGES.DECRYPTION_FAILED}: ${error instanceof Error ? error.message : String(error)}`
    );
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

  try {
    // 環境変数の読み取り
    const env = readEnvironmentVariables();

    // ジョブパラメータの取得
    params = getJobParameters();

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

    // パスワードの復号化
    const password = await decryptPassword(params.encryptedPassword, cryptoConfig);

    console.log('');
    console.log('Playwright自動化処理を開始します...');
    console.log('');

    // 二段階認証コード取得コールバック
    const waitFor2FA = async (): Promise<string> => {
      console.log('二段階認証が必要です。Web からコード入力を待機しています...');

      // ジョブステータスを WAITING_FOR_2FA に更新
      if (params?.jobId && params?.userId) {
        try {
          await updateBatchJob(params.jobId, params.userId, {
            status: 'WAITING_FOR_2FA',
          });
          console.log('ジョブステータスを WAITING_FOR_2FA に更新しました');
        } catch (error) {
          console.error('ジョブステータス更新に失敗しました (WAITING_FOR_2FA):', error);
          throw error;
        }
      }

      // DynamoDB をポーリングして二段階認証コードを取得
      const startTime = Date.now();
      const timeout = TIMEOUTS.TWO_FACTOR_AUTH_WAIT;

      while (Date.now() - startTime < timeout) {
        // 定期的にポーリング
        await sleep(TWO_FACTOR_AUTH_POLL_INTERVAL);

        try {
          const job = await import('@nagiyu/niconico-mylist-assistant-core').then((m) =>
            m.getBatchJob(params!.jobId, params!.userId)
          );

          if (job?.twoFactorAuthCode) {
            console.log('二段階認証コードを取得しました');

            // コードを取得したら、ステータスを RUNNING に戻す
            await updateBatchJob(params!.jobId, params!.userId, {
              status: 'RUNNING',
              twoFactorAuthCode: undefined, // コードをクリア
            });

            return job.twoFactorAuthCode;
          }
        } catch (error) {
          console.error('バッチジョブの取得に失敗:', error);
        }

        console.log('二段階認証コード待機中...');
      }

      throw new Error(ERROR_MESSAGES.TWO_FACTOR_AUTH_TIMEOUT);
    };

    // マイリスト登録処理の実行
    const result = await executeMylistRegistration(
      params.niconicoEmail,
      password,
      params.mylistName,
      params.videoIds,
      waitFor2FA
    );

    console.log('');
    console.log('=== 登録結果 ===');
    console.log(`成功: ${result.successVideoIds.length}件`);
    console.log(`失敗: ${result.failedVideoIds.length}件`);

    if (result.required2FA) {
      console.log('二段階認証: 必要でした');
    }

    if (result.failedVideoIds.length > 0) {
      console.log('失敗した動画ID:', result.failedVideoIds.join(', '));
    }

    if (result.errorMessage) {
      console.error('エラーメッセージ:', result.errorMessage);
    }

    console.log('================');

    // ジョブステータスを SUCCEEDED に更新
    if (params.jobId) {
      try {
        await updateBatchJob(params.jobId, params.userId, {
          status: 'SUCCEEDED',
          result: {
            registeredCount: result.successVideoIds.length,
            failedCount: result.failedVideoIds.length,
            totalCount: result.successVideoIds.length + result.failedVideoIds.length,
            errorMessage: result.errorMessage,
          },
          completedAt: Date.now(),
        });
        console.log('ジョブステータスを SUCCEEDED に更新しました');
      } catch (error) {
        console.error('ジョブステータス更新に失敗しました (SUCCEEDED):', error);
        // 更新失敗してもジョブ自体は成功
      }
    }

    // 完了ログ
    console.log('');
    console.log('========================================');
    console.log('バッチ処理完了');
    console.log(`完了時刻: ${getTimestamp()}`);
    console.log('========================================');

    // 一部失敗があってもバッチジョブ自体は成功とみなす
    // （全失敗の場合のみエラー終了）
    if (result.successVideoIds.length === 0 && result.failedVideoIds.length > 0) {
      console.error('全ての動画の登録に失敗しました');
      process.exit(1);
    }
  } catch (error) {
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
            errorMessage: error instanceof Error ? error.message : String(error),
          },
          completedAt: Date.now(),
        });
        console.log('ジョブステータスを FAILED に更新しました');
      } catch (updateError) {
        console.error('ジョブステータス更新に失敗しました (FAILED):', updateError);
      }
    }

    process.exit(1);
  }
}

// エントリーポイント
main().catch((error) => {
  console.error('予期しないエラーが発生しました:', error);
  process.exit(1);
});
