/**
 * ユーザー × キャラの状態。
 *
 * `tasks/livetalk/design.md` 3.1 / 3.2 節の `CharacterState` に対応。
 * 親密度・サイクルなどの本格的な値は Phase 3 以降で拡張するが、Phase 2a の段階で
 * Repository 抽象を用意して将来の追加に備える。
 */
export interface CharacterStateEntity {
  UserID: string;
  CharacterID: string;
  /** 親密度（上昇のみ。Phase 2a では既定値 0 を入れて Phase 3 で更新する） */
  AffectionLevel: number;
  /** 最終インタラクション時刻（Unix ms） */
  LastInteractionAt: number;
  /** オンボーディング完了フラグ */
  Onboarded: boolean;
  CreatedAt: number;
  UpdatedAt: number;
}

export interface CharacterStateKey {
  userId: string;
  characterId: string;
}

export type CreateCharacterStateInput = Omit<CharacterStateEntity, 'CreatedAt' | 'UpdatedAt'>;
export type UpdateCharacterStateInput = Partial<
  Pick<CharacterStateEntity, 'AffectionLevel' | 'LastInteractionAt' | 'Onboarded'>
>;
