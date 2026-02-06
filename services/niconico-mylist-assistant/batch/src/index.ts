/**
 * AWS Batch エントリーポイント
 *
 * ニコニコ動画マイリスト自動登録バッチジョブ
 */

import { executeMylistRegistration } from './playwright-automation.js';
import { ERROR_MESSAGES } from './constants.js';
import { getTimestamp, generateDefaultMylistName } from './utils.js';
import { MylistRegistrationJobParams } from './types.js';

/**
 * 環境変数を読み取る
 */
function readEnvironmentVariables(): {
  dynamodbTableName: string;
  sharedSecretKey: string;
  nodeEnv: string;
} {
  const dynamodbTableName = process.env.DYNAMODB_TABLE_NAME || '';
  const sharedSecretKey = process.env.SHARED_SECRET_KEY || '';
  const nodeEnv = process.env.NODE_ENV || 'development';

  console.log('=== 環境変数 ===');
  console.log(`DYNAMODB_TABLE_NAME: ${dynamodbTableName || '(not set)'}`);
  console.log(`SHARED_SECRET_KEY: ${sharedSecretKey ? '(set)' : '(not set)'}`);
  console.log(`NODE_ENV: ${nodeEnv}`);
  console.log('================');

  return { dynamodbTableName, sharedSecretKey, nodeEnv };
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

  let videoIds: string[] = [];
  try {
    videoIds = JSON.parse(videoIdsJson);
  } catch {
    throw new Error(`${ERROR_MESSAGES.INVALID_PARAMETERS}: VIDEO_IDS`);
  }

  if (!userId || !niconicoEmail || !encryptedPassword || videoIds.length === 0) {
    throw new Error(ERROR_MESSAGES.INVALID_PARAMETERS);
  }

  console.log('=== ジョブパラメータ ===');
  console.log(`ユーザーID: ${userId}`);
  console.log(`メールアドレス: ${niconicoEmail}`);
  console.log(`マイリスト名: ${mylistName}`);
  console.log(`動画数: ${videoIds.length}`);
  console.log('========================');

  return {
    userId,
    niconicoEmail,
    encryptedPassword,
    mylistName,
    videoIds,
  };
}

/**
 * パスワードを復号化する
 * 注: 将来的に実装予定（現在はプレースホルダー）
 */
function decryptPassword(encryptedPassword: string): string {
  // TODO: AES-256で復号化する実装
  // secretKey は環境変数 SHARED_SECRET_KEY から取得予定
  // 現在は暗号化されていない状態で受け取ることを想定
  console.log('パスワードを復号化中...');
  return encryptedPassword;
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

  try {
    // 環境変数の読み取り（現在は表示のみ）
    readEnvironmentVariables();

    // ジョブパラメータの取得
    const params = getJobParameters();

    // パスワードの復号化
    const password = decryptPassword(params.encryptedPassword);

    console.log('');
    console.log('Playwright自動化処理を開始します...');
    console.log('');

    // マイリスト登録処理の実行
    const result = await executeMylistRegistration(
      params.niconicoEmail,
      password,
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
    process.exit(1);
  }
}

// エントリーポイント
main().catch((error) => {
  console.error('予期しないエラーが発生しました:', error);
  process.exit(1);
});
