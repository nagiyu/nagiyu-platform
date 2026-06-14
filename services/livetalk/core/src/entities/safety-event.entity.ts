/**
 * セーフティ検出イベント（Phase 2d / Issue #3250）。
 *
 * DynamoDB Single Table:
 *   PK = USER#<googleId>
 *   SK = SAFETY#<ulid>
 *
 * TTL なし（人間レビュー用途のため永続保持）。
 * PII（InputText）を含むため、将来的に KMS CMK による暗号化を検討すること。
 *
 * GSI2: SafetyEvent のみを sparse 索引化する横断レビュー用 GSI（ADR-2.22 / #3580）
 * - GSI2PK='SAFETY' の SafetyEvent アイテムのみが対象
 * - 射影は INCLUDE（メタデータのみ。InputText / ResponseText は PII のため除外）
 *
 * @see docs/services/livetalk/architecture.md §3「データモデル概要」
 */

import type { SafetyTrigger } from '../safety/types.js';

export interface SafetyEventEntity {
  /** ユーザー識別子 */
  UserID: string;
  /** イベント ID（ULID、時系列ソート可能） */
  EventID: string;
  /**
   * 横断レビュー用キャラクター識別子（ADR-2.22 / #3580）。
   * チャット文脈で記録。既存レコードには無いため optional。
   */
  CharacterID?: string;
  /** 発生源（入力キーワード検出 or 応答後 Moderation） */
  Trigger: SafetyTrigger;
  /** 検出パターンの説明（カテゴリ名 + 一致テキスト） */
  DetectedPattern: string;
  /** 検出時のユーザー入力全文（PII を含む） */
  InputText: string;
  /** キャラが返した応答テキスト（または Moderation フラグの場合は LLM の原文） */
  ResponseText: string;
  /** 作成 / 更新時刻（Unix ms） */
  CreatedAt: number;
  UpdatedAt: number;
  /**
   * Moderation API がフラグを立てたカテゴリ（JSON 文字列）。
   * Trigger=output_moderation の場合のみ設定される。
   */
  ModerationCategories?: string;
}

export interface SafetyEventKey {
  userId: string;
  eventId: string;
}

/**
 * SafetyEvent 作成入力（`EventID` / `CreatedAt` / `UpdatedAt` はリポジトリ側で付与）。
 * CharacterID は横断レビュー用に作成時に必須とする（ADR-2.22 / #3580）。
 */
export type CreateSafetyEventInput = Omit<
  SafetyEventEntity,
  'EventID' | 'CreatedAt' | 'UpdatedAt'
> & {
  /** 明示的に ULID を指定したい場合のみ渡す（テスト用途） */
  EventID?: string;
  /** 横断レビュー用キャラクター識別子（作成時必須） */
  CharacterID: string;
};

/**
 * 横断一覧用の射影サマリ型（ADR-2.22 / #3580）。
 * GSI2 の INCLUDE 射影に含まれるメタデータのみを保持する。
 * PII（InputText / ResponseText）は含まない。
 */
export interface SafetyEventSummary {
  UserID: string;
  EventID: string;
  /** 横断レビュー用キャラクター識別子。既存レコードには無いため optional */
  CharacterID?: string;
  Trigger: SafetyTrigger;
  DetectedPattern: string;
  CreatedAt: number;
}
