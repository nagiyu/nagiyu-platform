import type { APIRequestContext, Locator, Page } from '@playwright/test';
import type { DeviceId } from '../src/spec-screenshot';

export interface ShotOptions {
  /** 指定すると、この要素の周りだけを撮る (ダイアログなど)。省略時はページ全体 */
  around?: Locator;
  /** `around` の周りに足す余白 (CSS px) */
  padding?: number;
  /** true なら、ページ全体ではなく表示領域 (画面の幅 × 高さ) だけを撮る */
  viewportOnly?: boolean;
  /** 撮る前に待つ時間 (ms)。canvas のチャートなど、描画が落ち着くのを待つときに使う */
  settleMs?: number;
}

export interface ScenarioContext {
  device: DeviceId;
  baseUrl: string;
  /** 今のページ。`freshPage` を呼ぶたびに作り直される */
  readonly page: Page;
  /** ルート・ヘッダー・ストレージを初期化したページに取り替える。状態ごとに前提を変えるときに使う */
  freshPage(options?: { roles?: string[] }): Promise<Page>;
  /** インメモリの DB を空にして、`seed` を投入する */
  resetData(seed?: unknown): Promise<void>;
  /** 画像を 1 枚撮る。ファイル名は `<画面>-<状態>-<端末>.png` */
  shot(state: string, options?: ShotOptions): Promise<void>;
}

export interface Scenario {
  /** 画面名。カードの名前 (`docs/specs/<service>/screen/<画面名>.md`) と同じにする */
  screen: string;
  /** この画面で撮るパターンを順に撮る */
  run(ctx: ScenarioContext): Promise<void>;
}

export interface CompanionProcess {
  /** リポジトリルートで実行するコマンド。ポートは `env` で渡す */
  command: string[];
  /** 補助のプロセスに渡す環境変数 */
  env?: Record<string, string>;
  /** 起動を待つ URL */
  healthUrl: string;
  /** 起動に必要なファイル (リポジトリルートからのパス)。無ければ起動の前に止める */
  requiredFiles?: string[];
}

export interface ServiceCapture {
  service: string;
  /** 撮る端末。要件で決まるサービスごとの幅 */
  devices: DeviceId[];
  /** 撮影用にサービスを起動するコマンド */
  server: {
    /** リポジトリルートからの作業ディレクトリ */
    cwd: string;
    /** 起動の前に実行するビルド。開発サーバーは画面の再読み込みを繰り返して撮影が安定しないため、ビルド済みのサービスを撮る (CI の E2E と同じ) */
    build: string[];
    /** ビルド済みのサービスを起動するコマンド。ポートは末尾に `-p` で渡す */
    command: string[];
    port: number;
    /** 起動を待つパス */
    healthPath: string;
    /** 読み込む環境変数ファイル (リポジトリルートからのパス)。E2E と同じ設定を使う。E2E に環境変数ファイルがないサービスは省略し、`extraEnv` だけで起動する */
    envFile?: string;
    /** 起動前に必要なビルド成果物 (リポジトリルートからのパス) */
    requiredBuilds: string[];
    /** 環境変数ファイルの値に足す (または上書きする) 環境変数。E2E の設定だけでは足りないサービス向け */
    extraEnv?: Record<string, string>;
    /** サービスの前に起動する補助のプロセス (偽の外部サーバーなど)。撮影の終わりにまとめて止める */
    companions?: CompanionProcess[];
  };
  /** `freshPage` でロールを指定しなかったときに使うロール */
  defaultRoles: string[];
  /**
   * インメモリの DB を空にして `seed` を投入する処理。省略すると、サービスの `POST /api/test/reset` に `seed` をそのまま送る。
   * 初期化用のエンドポイントが 1 本にまとまっていないサービス (テスト用の API が複数に分かれているなど) が差し替える
   */
  resetData?: (request: APIRequestContext, baseUrl: string, seed: unknown) => Promise<void>;
  /** 画面の日時として固定する時刻 */
  fixedTime: string;
  scenarios: Scenario[];
}
