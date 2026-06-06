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
