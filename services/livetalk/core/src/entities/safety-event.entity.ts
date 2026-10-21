/**
 * セーフティ検出イベント（Phase 2d / Issue #3250）。
 *
 * DynamoDB Single Table:
 *   PK = USER#<userId>
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
  userId: string;
  /** イベント ID（ULID、時系列ソート可能） */
  eventId: string;
  /**
   * 横断レビュー用キャラクター識別子（ADR-2.22 / #3580）。
   * チャット文脈で記録。既存レコードには無いため optional。
   */
  characterId?: string;
  /** 発生源（入力キーワード検出 or 応答後 Moderation） */
  trigger: SafetyTrigger;
  /** 検出パターンの説明（カテゴリ名 + 一致テキスト） */
  detectedPattern: string;
  /** 検出時のユーザー入力全文（PII を含む） */
  inputText: string;
  /** キャラが返した応答テキスト（または Moderation フラグの場合は LLM の原文） */
  responseText: string;
  /** 作成 / 更新時刻（Unix ms） */
  createdAt: number;
  updatedAt: number;
  /**
   * Moderation API がフラグを立てたカテゴリ（JSON 文字列）。
   * Trigger=output_moderation の場合のみ設定される。
   */
  moderationCategories?: string;
}

export interface SafetyEventKey {
  userId: string;
  eventId: string;
}

/**
 * SafetyEvent 作成入力（`eventId` / `createdAt` / `updatedAt` はリポジトリ側で付与）。
 * characterId は横断レビュー用に作成時に必須とする（ADR-2.22 / #3580）。
 */
export type CreateSafetyEventInput = Omit<
  SafetyEventEntity,
  'eventId' | 'createdAt' | 'updatedAt'
> & {
  /** 明示的に ULID を指定したい場合のみ渡す（テスト用途） */
  eventId?: string;
  /** 横断レビュー用キャラクター識別子（作成時必須） */
  characterId: string;
};

/**
 * 横断一覧用の射影サマリ型（ADR-2.22 / #3580）。
 * GSI2 の INCLUDE 射影に含まれるメタデータのみを保持する。
 * PII（InputText / ResponseText）は含まない。
 */
export interface SafetyEventSummary {
  userId: string;
  eventId: string;
  /** 横断レビュー用キャラクター識別子。既存レコードには無いため optional */
  characterId?: string;
  trigger: SafetyTrigger;
  detectedPattern: string;
  createdAt: number;
}
