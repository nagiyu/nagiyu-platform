import type { CreateNoteInput, NoteEntity, NoteKey } from '../entities/note.entity.js';

export interface NoteRepository {
  put(input: CreateNoteInput): Promise<NoteEntity>;
  /** キャラ単位のノートを CreatedAt 降順で返す。 */
  list(userId: string, characterId: string, limit?: number): Promise<NoteEntity[]>;
  /** 単一ノートを返す。なければ null。 */
  get(key: NoteKey): Promise<NoteEntity | null>;
  /**
   * 直近 days 日に作成されたノートを CreatedAt 降順で返す（チャットの感想連携用）。
   * 「あのノート良かった」にキャラが反応できるよう、直近提示分を context に注入する。
   */
  listRecent(
    userId: string,
    characterId: string,
    options: { days: number; limit?: number }
  ): Promise<NoteEntity[]>;
}
