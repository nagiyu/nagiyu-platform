/**
 * ユーザー × キャラの状態。
 *
 * `docs/services/livetalk/architecture.md` §3「データモデル概要」の CharacterState に対応。
 *
 * Phase 2a スコープでは Repository 抽象とキー設計の確立のみが目的。
 * 親密度（`affectionLevel`）/ オンボーディングフラグ（`Onboarded`）は
 * それぞれ Phase 3（記憶と性格の育成）/ Phase 2e（規約 + 18 歳同意）で
 * 利用が始まるため、必要になった段階で attribute を追加する方針。
 */
export interface CharacterStateEntity {
  userId: string;
  characterId: string;
  /** 最終インタラクション時刻（Unix ms） */
  lastInteractionAt: number;
  /**
   * 親密度レベル（Phase 3f で追加）。
   * 上昇のみ・降下なし。UI には表示しない（Phase 6+ で口調変調に活用予定）。
   * 既存アイテムとの後方互換のため optional（未定義は 0 として扱う）。
   */
  affectionLevel?: number;
  createdAt: number;
  updatedAt: number;
}

export interface CharacterStateKey {
  userId: string;
  characterId: string;
}

export type CreateCharacterStateInput = Omit<CharacterStateEntity, 'createdAt' | 'updatedAt'>;
export type UpdateCharacterStateInput = Partial<
  Pick<CharacterStateEntity, 'lastInteractionAt' | 'affectionLevel'>
>;
