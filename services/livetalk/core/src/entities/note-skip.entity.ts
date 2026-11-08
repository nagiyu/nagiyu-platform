/**
 * ノート生成で LLM が「生成しない」と判断した Topic の記録。
 *
 * LLM の判断は渡した中身 (Topic の WEB fact) で決まるため、判断後に WEB fact が増えない限り
 * 同じ Topic を評価し直しても結果は変わらない。評価し直しを避けるために判断時刻を覚える。
 *
 * DynamoDB SK: `CHAR#<charId>#NOTESKIP#<topicId>`
 */
export interface NoteSkipEntity {
  userId: string;
  characterId: string;
  topicId: string;
  /**
   * 判断に使う中身を読み始めた時刻 (Unix ms)。
   * これより後に作成された WEB fact があるときだけ評価し直す。
   * 読んだ後に増えた fact を取りこぼさないよう、保存時刻ではなく読む前の時刻を使う。
   */
  decidedAt: number;
  updatedAt: number;
}

export interface NoteSkipKey {
  userId: string;
  characterId: string;
  topicId: string;
}

/** 記録の保存入力。`updatedAt` はリポジトリ側で付与する */
export type PutNoteSkipInput = Omit<NoteSkipEntity, 'updatedAt'>;
