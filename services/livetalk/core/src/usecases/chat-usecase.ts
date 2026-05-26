import type { ILLMClient } from '../llm-client/types.js';
import type { IVoiceClient } from '../voicevox/types.js';
import type { MessageRepository } from '../repositories/message.repository.interface.js';
import type { CharacterDefinition } from '../characters/types.js';
import { buildChatMessages } from '../characters/prompt-builder.js';
import { SentenceBuffer } from '../lib/sentence-splitter.js';
import { DEFAULT_CHARACTER_ID } from '../constants.js';

/**
 * /api/chat ストリーミングレスポンスの各イベント型。
 *
 * - text: LLM からの逐次テキスト delta
 * - sentence: 文単位の音声（base64 WAV）。LLM ストリーム完了後に順番通り emit される
 * - done: ストリーム終了
 */
export type ChatEvent =
  | { type: 'text'; delta: string }
  | { type: 'sentence'; index: number; text: string; audio: string }
  | { type: 'done' };

export interface ChatUseCaseParams {
  userId: string;
  characterId?: string;
  userText: string;
  character: CharacterDefinition;
  llmClient: ILLMClient;
  voiceClient: IVoiceClient;
  messageRepository: MessageRepository;
}

type SynthesisResult = { index: number; text: string; audio: string | null };

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function synthesizeSentence(
  voiceClient: IVoiceClient,
  text: string,
  speakerId: number,
  index: number
): Promise<SynthesisResult> {
  try {
    const wav = await voiceClient.synthesize(text, speakerId);
    const audio = arrayBufferToBase64(wav);
    return { index, text, audio };
  } catch (err) {
    console.error('[chat-usecase] VOICEVOX 合成に失敗しました', err);
    return { index, text, audio: null };
  }
}

/**
 * チャット応答の orchestration（Phase 2c / Issue #3249）。
 *
 * フロー:
 *   1. 直近会話履歴を取得（現在のユーザー発話は保存前なので含まれない）
 *   2. ユーザーメッセージを DynamoDB に保存
 *   3. LLM ストリーミング → text delta を逐次 yield
 *   4. 文区切りごとに VOICEVOX を非同期起動（LLM streaming と並行）
 *   5. LLM 完了後、sentence events を順番通りに yield
 *   6. done を yield
 *   7. アシスタントメッセージを DynamoDB に保存
 *
 * VOICEVOX エラーは sentence event をスキップして継続（テキストは既に表示済み）。
 * アシスタント保存エラーはログのみ（done 後なので HTTP response には影響しない）。
 */
export async function* runChatUseCase(params: ChatUseCaseParams): AsyncGenerator<ChatEvent> {
  const {
    userId,
    characterId = DEFAULT_CHARACTER_ID,
    userText,
    character,
    llmClient,
    voiceClient,
    messageRepository,
  } = params;

  // 1. 直近会話履歴取得（現在のユーザー発話を含まない順で取得する）
  const { messages: history } = await messageRepository.getRecentByTokenBudget({
    userId,
    characterId,
  });

  // 2. ユーザーメッセージを保存
  await messageRepository.create({
    UserID: userId,
    CharacterID: characterId,
    Role: 'user',
    Text: userText,
  });

  // 3. LLM ストリーミング
  const chatMessages = buildChatMessages(character, new Date(), history, userText);
  const sentenceBuffer = new SentenceBuffer();
  let fullResponseText = '';
  const pendingSynthesis: Array<Promise<SynthesisResult>> = [];
  let sentenceIndex = 0;

  for await (const delta of llmClient.chatStream(chatMessages)) {
    yield { type: 'text', delta };
    fullResponseText += delta;

    // 4. 文区切りを検出したら VOICEVOX を非同期起動
    for (const sentence of sentenceBuffer.push(delta)) {
      const idx = sentenceIndex++;
      pendingSynthesis.push(
        synthesizeSentence(voiceClient, sentence, character.voiceConfig.speakerId, idx)
      );
    }
  }

  // LLM 終了後の残余バッファを処理
  const remaining = sentenceBuffer.flush();
  if (remaining) {
    const idx = sentenceIndex;
    pendingSynthesis.push(
      synthesizeSentence(voiceClient, remaining, character.voiceConfig.speakerId, idx)
    );
  }

  // 5. sentence events を順番通りに yield
  for (const promise of pendingSynthesis) {
    const result = await promise;
    if (result.audio !== null) {
      yield { type: 'sentence', index: result.index, text: result.text, audio: result.audio };
    }
  }

  // 6. done
  yield { type: 'done' };

  // 7. アシスタントメッセージを保存
  const assistantText = fullResponseText.trim();
  if (assistantText) {
    try {
      await messageRepository.create({
        UserID: userId,
        CharacterID: characterId,
        Role: 'assistant',
        Text: assistantText,
      });
    } catch (err) {
      console.error('[chat-usecase] アシスタントメッセージの保存に失敗しました', err);
    }
  }
}
