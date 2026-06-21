/**
 * ニコニコセッション管理ビジネスロジック
 *
 * API ルートから呼び出されるサーバー側ロジック。
 * クッキー値・復号結果はログ出力しない。
 */

import {
  encrypt,
  decrypt,
  createNiconicoCredentialRepository,
  validateUserSession,
} from '@nagiyu/niconico-mylist-assistant-core';
import type { CryptoConfig } from '@nagiyu/niconico-mylist-assistant-core';
import { ERROR_MESSAGES } from '../constants/errors';

/** セッション有効期間（30 日）*/
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * セッション状態レスポンス
 */
export interface NiconicoSessionStatus {
  /** セッションが保存されているか */
  hasSession: boolean;
  /** セッションの有効性（保存セッションがない場合は undefined） */
  validity: 'valid' | 'invalid' | 'unknown' | undefined;
  /** セッション取得日時（epoch ms） */
  acquiredAt: number | undefined;
  /** セッション推定有効期限（epoch ms） */
  estimatedExpiresAt: number | undefined;
}

/**
 * 保存済みセッションの状態を取得する
 *
 * 保存セッションを復号→validateUserSession にかけて状態を返す。
 * 復号結果はログに出力しない。
 *
 * @param userId - ユーザーID
 * @param cryptoConfig - 暗号化設定
 * @returns セッション状態
 */
export async function getNiconicoSessionStatus(
  userId: string,
  cryptoConfig: CryptoConfig
): Promise<NiconicoSessionStatus> {
  const repo = createNiconicoCredentialRepository();
  const credential = await repo.getByUserId(userId);

  if (!credential) {
    return {
      hasSession: false,
      validity: undefined,
      acquiredAt: undefined,
      estimatedExpiresAt: undefined,
    };
  }

  // 保存ブロブを復号して検証
  // JSON パース or 復号が失敗した場合でも壊れた資格情報を UI から削除できるよう、
  // throw せずに validity='invalid' で返す（自己回復パス）
  let encryptedData: { ciphertext: string; iv: string; authTag: string };
  try {
    encryptedData = JSON.parse(credential.encryptedUserSession) as {
      ciphertext: string;
      iv: string;
      authTag: string;
    };
  } catch {
    // JSON パース失敗：クッキー値・復号結果はログ出力しない
    console.error(ERROR_MESSAGES.NICONICO_SESSION_DECRYPT_FAILED);
    return {
      hasSession: true,
      validity: 'invalid',
      acquiredAt: credential.acquiredAt,
      estimatedExpiresAt: credential.estimatedExpiresAt,
    };
  }

  let userSession: string;
  try {
    userSession = await decrypt(encryptedData, cryptoConfig);
  } catch {
    // 復号失敗：クッキー値・復号結果はログ出力しない
    console.error(ERROR_MESSAGES.NICONICO_SESSION_DECRYPT_FAILED);
    return {
      hasSession: true,
      validity: 'invalid',
      acquiredAt: credential.acquiredAt,
      estimatedExpiresAt: credential.estimatedExpiresAt,
    };
  }

  const validity = await validateUserSession(userSession);

  return {
    hasSession: true,
    validity,
    acquiredAt: credential.acquiredAt,
    estimatedExpiresAt: credential.estimatedExpiresAt,
  };
}

/**
 * ニコニコセッションを検証して保存する
 *
 * valid のみ保存。invalid/unknown は保存を拒否してエラーを投げる。
 *
 * @param userId - ユーザーID
 * @param userSession - 検証・保存対象の user_session 値
 * @param cryptoConfig - 暗号化設定
 * @returns 保存結果（acquiredAt, estimatedExpiresAt）
 * @throws {InvalidSessionError} セッションが無効な場合
 * @throws {IndeterminateSessionError} セッションの有効性が判定不能な場合
 */
export async function saveNiconicoSession(
  userId: string,
  userSession: string,
  cryptoConfig: CryptoConfig
): Promise<{ acquiredAt: number; estimatedExpiresAt: number }> {
  // 先にセッションを検証する（ワンショット保存なので未検証保存は避ける）
  const validity = await validateUserSession(userSession);

  if (validity === 'invalid') {
    throw new InvalidSessionError();
  }

  if (validity === 'unknown') {
    throw new IndeterminateSessionError();
  }

  // valid → 暗号化して保存
  const encryptedData = await encrypt(userSession, cryptoConfig);
  // バッチの ENCRYPTED_USER_SESSION と同形式（再暗号化不要）
  const encryptedUserSession = JSON.stringify(encryptedData);

  const now = Date.now();
  const acquiredAt = now;
  const estimatedExpiresAt = now + SESSION_TTL_MS;

  const repo = createNiconicoCredentialRepository();
  await repo.upsert({
    userId,
    encryptedUserSession,
    acquiredAt,
    estimatedExpiresAt,
  });

  return { acquiredAt, estimatedExpiresAt };
}

/**
 * 保存済みニコニコセッションを削除する
 *
 * @param userId - ユーザーID
 */
export async function deleteNiconicoSession(userId: string): Promise<void> {
  const repo = createNiconicoCredentialRepository();
  await repo.delete(userId);
}

/**
 * 保存済みセッションの暗号化ブロブを取得する
 *
 * バッチジョブへ ENCRYPTED_USER_SESSION として渡す際に使用する（再暗号化不要）。
 *
 * @param userId - ユーザーID
 * @returns 暗号化ブロブ（JSON.stringify(EncryptedData) 形式）または null
 */
export async function getEncryptedUserSessionBlob(userId: string): Promise<string | null> {
  const repo = createNiconicoCredentialRepository();
  const credential = await repo.getByUserId(userId);

  if (!credential) {
    return null;
  }

  return credential.encryptedUserSession;
}

/**
 * セッションが無効な場合のエラー
 */
export class InvalidSessionError extends Error {
  constructor() {
    super('InvalidSession');
    this.name = 'InvalidSessionError';
  }
}

/**
 * セッションの有効性が判定不能な場合のエラー
 */
export class IndeterminateSessionError extends Error {
  constructor() {
    super('IndeterminateSession');
    this.name = 'IndeterminateSessionError';
  }
}
