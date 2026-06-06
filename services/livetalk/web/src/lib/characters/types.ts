/**
 * キャラクターの Live2D 描画設定（web 層専用）。
 *
 * core の CharacterDefinition はロジック・アイデンティティのみを持ち、
 * ビジュアル設定はこの型に分離する。
 */
export interface CharacterRenderProfile {
  /** Live2D model3.json のパス（public 配下の絶対パス） */
  modelPath: string;
  /** Cubism パラメータ ID（モデル差し替え時に上書き可能。既定は Cubism 標準 ID） */
  cubismParams: {
    mouthOpenY: string;
    eyeLOpen: string;
    eyeROpen: string;
  };
}

/**
 * UI で使用するキャラクターの表示名情報（web 専用）。
 */
export interface CharacterDisplay {
  /** 正式名称（core の CharacterDefinition.displayName と一致させる） */
  displayName: string;
  /** UI 用の短縮名（web 専用。core には対応フィールドなし） */
  shortName: string;
}

/**
 * クライアント側で必要なキャラクター情報をまとめたプロファイル。
 * core 非依存なのでクライアントバンドルに含めても server コードを引き込まない。
 */
export interface CharacterClientProfile {
  display: CharacterDisplay;
  render: CharacterRenderProfile;
  /**
   * フッターに常時表示するライセンス・クレジット文字列。
   * Live2D Free Material License / VOICEVOX クレジットの常時表示要件を満たす。
   */
  licenseText: string;
}
