/**
 * Alert Detail API Endpoint
 *
 * PUT /api/alerts/{id} - アラート更新
 * DELETE /api/alerts/{id} - アラート削除
 *
 * Required Permission: stocks:write-own
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateAlert } from '@nagiyu/stock-tracker-core';
import { withAuth, handleApiError } from '@nagiyu/nextjs';
import { createAlertRepository, createTickerRepository } from '../../../../lib/repository-factory';
import { getSession } from '../../../../lib/auth';
import type { AlertEntity } from '@nagiyu/stock-tracker-core';

/**
 * エラーメッセージ定数
 */
const ERROR_MESSAGES = {
  ALERT_NOT_FOUND: '指定されたアラートが見つかりません',
  INVALID_REQUEST_BODY: 'リクエストボディが不正です',
  VALIDATION_ERROR: '入力データが不正です',
  UPDATE_ERROR: 'アラートの更新に失敗しました',
  DELETE_ERROR: 'アラートの削除に失敗しました',
  NO_UPDATE_FIELDS: '更新する内容を指定してください',
} as const;

/**
 * レスポンス型定義
 */
interface AlertResponse {
  alertId: string;
  tickerId: string;
  symbol: string;
  name: string;
  mode: string;
  frequency: string;
  conditions: Array<{
    field: string;
    operator: string;
    value: number;
  }>;
  logicalOperator?: 'AND' | 'OR';
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface DeleteResponse {
  success: boolean;
  deletedAlertId: string;
}

interface ErrorResponse {
  error: string;
  message: string;
  details?: string[];
}

/**
 * Alert エンティティをレスポンス形式に変換
 */
function mapAlertToResponse(
  alert: AlertEntity,
  tickerSymbol: string,
  tickerName: string
): AlertResponse {
  const response: AlertResponse = {
    alertId: alert.AlertID,
    tickerId: alert.TickerID,
    symbol: tickerSymbol,
    name: tickerName,
    mode: alert.Mode,
    frequency: alert.Frequency,
    conditions: alert.ConditionList,
    enabled: alert.Enabled,
    createdAt: new Date(alert.CreatedAt).toISOString(),
    updatedAt: new Date(alert.UpdatedAt).toISOString(),
  };

  // LogicalOperator が存在する場合のみ追加
  if (alert.LogicalOperator) {
    response.logicalOperator = alert.LogicalOperator;
  }

  return response;
}

/**
 * PUT /api/alerts/{id}
 * アラート更新
 */
export const PUT = withAuth(
  getSession,
  'stocks:write-own',
  async (
    session,
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
  ): Promise<NextResponse<AlertResponse | ErrorResponse>> => {
    try {
      // パラメータの取得
      const { id: alertId } = await params;
      const userId = session.user.userId;

      // リクエストボディの取得
      let body;
      try {
        body = await request.json();
      } catch {
        return NextResponse.json(
          {
            error: 'INVALID_REQUEST',
            message: ERROR_MESSAGES.INVALID_REQUEST_BODY,
          },
          { status: 400 }
        );
      }

      // リポジトリの初期化
      const alertRepo = createAlertRepository();
      const tickerRepo = createTickerRepository();

      // 既存アラートを取得（部分更新用）
      const existingAlert = await alertRepo.getById(userId, alertId);
      if (!existingAlert) {
        return NextResponse.json(
          {
            error: 'NOT_FOUND',
            message: ERROR_MESSAGES.ALERT_NOT_FOUND,
          },
          { status: 404 }
        );
      }

      // 更新可能なフィールドを抽出
      const updates: Partial<AlertEntity> = {};

      if (body.conditions !== undefined) {
        // 条件の部分更新をサポート
        // Phase 1: 条件は1つのみなので、既存条件とマージ
        const existingCondition = existingAlert.ConditionList[0];
        const updateCondition = body.conditions[0];

        if (updateCondition) {
          updates.ConditionList = [
            {
              field: updateCondition.field ?? existingCondition.field,
              operator: updateCondition.operator ?? existingCondition.operator,
              value: updateCondition.value ?? existingCondition.value,
            },
          ];
        }
      }

      if (body.enabled !== undefined) {
        updates.Enabled = body.enabled;
      }

      // LogicalOperator は 'AND' | 'OR' のみ許容（null は除外）
      if (body.logicalOperator !== undefined && body.logicalOperator !== null) {
        updates.LogicalOperator = body.logicalOperator;
      }

      // 更新フィールドが存在しない場合
      if (Object.keys(updates).length === 0) {
        return NextResponse.json(
          {
            error: 'INVALID_REQUEST',
            message: ERROR_MESSAGES.NO_UPDATE_FIELDS,
          },
          { status: 400 }
        );
      }

      // 更新後のデータを構築してバリデーション
      const updatedAlertData = {
        ...existingAlert,
        ...updates,
        UpdatedAt: Date.now(),
      };

      const validationResult = validateAlert(updatedAlertData);
      if (!validationResult.valid) {
        return NextResponse.json(
          {
            error: 'INVALID_REQUEST',
            message: ERROR_MESSAGES.VALIDATION_ERROR,
            details: validationResult.errors,
          },
          { status: 400 }
        );
      }

      // アラートを更新
      const updatedAlert = await alertRepo.update(userId, alertId, updates);

      // TickerリポジトリでSymbolとNameを取得
      const ticker = await tickerRepo.getById(updatedAlert.TickerID);

      // レスポンス形式に変換
      const response = mapAlertToResponse(
        updatedAlert,
        ticker?.Symbol || updatedAlert.TickerID.split(':')[1] || '',
        ticker?.Name || ''
      );

      return NextResponse.json(response, { status: 200 });
    } catch (error) {
      return handleApiError(error);
    }
  }
);

/**
 * DELETE /api/alerts/{id}
 * アラート削除
 */
export const DELETE = withAuth(
  getSession,
  'stocks:write-own',
  async (
    session,
    _request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
  ): Promise<NextResponse<DeleteResponse | ErrorResponse>> => {
    try {
      // パラメータの取得
      const { id: alertId } = await params;
      const userId = session.user.userId;

      // リポジトリの初期化
      const alertRepo = createAlertRepository();

      // アラートを削除
      await alertRepo.delete(userId, alertId);

      // レスポンス
      const response: DeleteResponse = {
        success: true,
        deletedAlertId: alertId,
      };

      return NextResponse.json(response, { status: 200 });
    } catch (error) {
      return handleApiError(error);
    }
  }
);
