import type { IVoiceClient, VoiceConfig } from './types.js';

/**
 * CompositeVoiceClient のエラーメッセージ（日本語、定数化）。
 */
export const COMPOSITE_VOICE_ERROR_MESSAGES = {
  UNKNOWN_PROVIDER: '指定された音声プロバイダのクライアントが登録されていません',
} as const;

/**
 * CompositeVoiceClient の構築オプション。
 */
export interface CompositeVoiceClientOptions {
  /**
   * provider 名をキーとするクライアントマップ。
   * 値として IVoiceClient インスタンスまたは遅延ファクトリ（初回利用時に生成・キャッシュ）を受け付ける。
   * 遅延ファクトリを使うと、キー不在等で構築できないプロバイダを登録しなくて済む。
   */
  clients: Partial<Record<VoiceConfig['provider'], IVoiceClient | (() => IVoiceClient)>>;
  /** voice 未指定時に使用する既定プロバイダ */
  defaultProvider: VoiceConfig['provider'];
}

/**
 * 複数プロバイダを束ね、voice.provider に応じて適切なクライアントへ委譲する合成クライアント。
 *
 * - voice.provider が指定されている場合はそのクライアントへ委譲する。
 * - voice が省略された場合は defaultProvider のクライアントへ委譲する。
 * - clients の値がファクトリ関数の場合、初回呼び出し時に生成・キャッシュする（遅延初期化）。
 *   これにより、voicevox のみのリクエストで OPENAI_API_KEY が不在でも落ちない。
 */
export class CompositeVoiceClient implements IVoiceClient {
  private readonly clientFactories: Partial<
    Record<VoiceConfig['provider'], IVoiceClient | (() => IVoiceClient)>
  >;
  private readonly resolvedClients: Partial<Record<VoiceConfig['provider'], IVoiceClient>> = {};
  private readonly defaultProvider: VoiceConfig['provider'];

  constructor(options: CompositeVoiceClientOptions) {
    this.clientFactories = options.clients;
    this.defaultProvider = options.defaultProvider;
  }

  public async synthesize(text: string, voice?: VoiceConfig): Promise<ArrayBuffer> {
    const provider = voice?.provider ?? this.defaultProvider;
    const client = this.resolveClient(provider);
    if (!client) {
      throw new Error(
        `${COMPOSITE_VOICE_ERROR_MESSAGES.UNKNOWN_PROVIDER}: provider=${provider}`
      );
    }
    return client.synthesize(text, voice);
  }

  /**
   * 指定 provider のクライアントを返す。
   * ファクトリ関数が登録されている場合は初回呼び出し時に生成してキャッシュする。
   */
  private resolveClient(
    provider: VoiceConfig['provider']
  ): IVoiceClient | undefined {
    // 既に解決済みのクライアントがある場合はそれを返す
    const cached = this.resolvedClients[provider];
    if (cached) {
      return cached;
    }

    const entry = this.clientFactories[provider];
    if (!entry) {
      return undefined;
    }

    // ファクトリ関数の場合は実行してキャッシュする
    if (typeof entry === 'function') {
      const created = entry();
      this.resolvedClients[provider] = created;
      return created;
    }

    // IVoiceClient インスタンスの場合はそのままキャッシュする
    this.resolvedClients[provider] = entry;
    return entry;
  }
}
