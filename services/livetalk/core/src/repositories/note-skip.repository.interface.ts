import type {
  NoteSkipEntity,
  NoteSkipKey,
  PutNoteSkipInput,
} from '../entities/note-skip.entity.js';

/**
 * ノート生成の「生成しない」判断の記録のリポジトリ。
 */
export interface NoteSkipRepository {
  /** 記録を保存する。既にあれば上書きする。 */
  put(input: PutNoteSkipInput): Promise<NoteSkipEntity>;
  /** キャラ単位の記録を全件返す (候補ごとの読み取りを避けるため 1 回でまとめて読む)。 */
  listAll(userId: string, characterId: string): Promise<NoteSkipEntity[]>;
  /** 記録を削除する。無くても成功する。 */
  delete(key: NoteSkipKey): Promise<void>;
}
