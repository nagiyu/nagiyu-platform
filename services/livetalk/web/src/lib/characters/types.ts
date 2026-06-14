/**
 * キャラクターの描画設定（web 層専用）。
 *
 * core の CharacterDefinition はロジック・アイデンティティのみを持ち、
 * ビジュアル設定はこの型に分離する。
 *
 * renderer フィールドで描画方式を区別する discriminated union。
 * - 'live2d': PixiJS + pixi-live2d-display を使った Live2D モデル描画
 * - 'placeholder': Live2D モデル未用意のキャラ向けプレースホルダー描画（シルエット + 名前ラベル）
 * - 'still': 完成した一枚絵（静止画 1 枚）の描画。アニメーションなし。
 * - 'sprite': 一枚絵のパーツを重ね合わせて瞬き＋音声連動口パクを行う描画。
 */
export type CharacterRenderProfile =
  | {
      /** Live2D モデルを使った描画 */
      renderer: 'live2d';
      /** Live2D model3.json のパス（public 配下の絶対パス） */
      modelPath: string;
      /** Cubism パラメータ ID（モデル差し替え時に上書き可能。既定は Cubism 標準 ID） */
      cubismParams: {
        /** 口の開き具合を制御するパラメータ ID */
        mouthOpenY: string;
        /** 左目の開き具合を制御するパラメータ ID */
        eyeLOpen: string;
        /** 右目の開き具合を制御するパラメータ ID */
        eyeROpen: string;
      };
    }
  | {
      /** Live2D モデル未用意のキャラ向けプレースホルダー描画（シルエット + 名前ラベル、音声連動の口パク） */
      renderer: 'placeholder';
    }
  | {
      /** 完成した一枚絵（静止画 1 枚）の描画。アニメーションなし。 */
      renderer: 'still';
      /** 一枚絵画像のパス（public/CloudFront 配下の絶対パス。例: /assets/characters/ageha/still.png） */
      imagePath: string;
    }
  | {
      /** 一枚絵のパーツを重ね合わせて瞬き＋音声連動口パクを行う描画。 */
      renderer: 'sprite';
      /** パーツ画像のパス群（public/CloudFront 配下の絶対パス） */
      sprite: {
        /** 目・口を含まないベース画像 */
        base: string;
        /** 開いた目 */
        eyeOpen: string;
        /** 閉じた目（瞬き時に重ねる） */
        eyeClosed: string;
        /** 開いた口（発話時に音量連動で不透明度を上げる） */
        mouthOpen: string;
        /** 閉じた口（常時表示のベース口） */
        mouthClosed: string;
      };
    };

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
 * キャラクターの技術属性（モデル・音声など）。
 * 「どのエンジンで、誰／何なのか」を一目で示すための表示用情報。
 */
export interface CharacterAttribute {
  /** 採用技術・エンジン名（例: 'Live2D', 'VOICEVOX'） */
  engine: string;
  /** 具体名（モデル名・話者名など） */
  name: string;
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
  /**
   * ユーザー向けの短い特徴・性格説明（1〜2 文）。
   * キャラ選択モーダルでの説明表示に使用する。
   */
  description: string;
  /**
   * 見た目モデルの技術属性（例: Live2D の「桃瀬ひより」）。
   * キャラが増えても誰の何のモデルかを一目で分かるようにする。
   */
  model: CharacterAttribute;
  /**
   * 音声の技術属性（例: VOICEVOX の「冥鳴ひまり」）。
   */
  voice: CharacterAttribute;
}
