export interface MemorySummaryEntity {
  UserID: string;
  CharacterID: string;
  SummaryText: string;
  LastCompressedAt: number;
  CreatedAt: number;
  UpdatedAt: number;
}

export interface MemorySummaryKey {
  userId: string;
  characterId: string;
}

export type CreateMemorySummaryInput = Omit<MemorySummaryEntity, 'CreatedAt' | 'UpdatedAt'>;
