/**
 * 暗号化結果
 */
export interface EncryptedData {
  /** 暗号化されたデータ（Base64エンコード） */
  ciphertext: string;
  /** 初期化ベクトル（Base64エンコード） */
  iv: string;
  /** 認証タグ（Base64エンコード） */
  authTag: string;
}

/**
 * 暗号化設定
 */
export interface CryptoConfig {
  /** Secrets Manager のシークレット名 */
  secretName: string;
  /** AWS リージョン（デフォルト: ap-northeast-1） */
  region?: string;
}
