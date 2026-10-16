/**
 * Alert Detail API Endpoint
 *
 * PUT /api/alerts/{id} - アラート更新
 * DELETE /api/alerts/{id} - アラート削除
 *
 * Required Permission: stocks:write-own
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateAlert, calculateTemporaryExpireDate } from '@nagiyu/stock-tracker-core';
import { withAuth, readJsonObjectBody } from '@nagiyu/nextjs';
import {
  createAlertRepository,
  createTickerRepository,
  createExchangeRepository,
} from '../../../../lib/repository-factory';
import { getSession } from '../../../../lib/auth';
import { withApiErrorReporting } from '../../../../lib/api-error-reporting';
import { parseAlertConditionList } from '../../../../lib/alert-condition';
import { isRecord } from '../../../../lib/request-guards';
import type { AlertEntity } from '@nagiyu/stock-tracker-core';
import type { ErrorResponse } from '@nagiyu/common';
import { COMMON_ERROR_MESSAGES } from '@nagiyu/common';

/**
 * エラーメッセージ定数
 */
const ERROR_MESSAGES = {
  ALERT_NOT_FOUND: '指定されたアラートが見つかりません',
  INVALID_REQUEST_BODY: COMMON_ERROR_MESSAGES.INVALID_REQUEST_BODY,
  VALIDATION_ERROR: '入力データが不正です',
  UPDATE_ERROR: 'アラートの更新に失敗しました',
  DELETE_ERROR: 'アラートの削除に失敗しました',
  NO_UPDATE_FIELDS: '更新する内容を指定してください',
  EXCHANGE_NOT_FOUND: '取引所情報が見つかりません',
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
    isPercentage?: boolean;
    percentageValue?: number;
    basePrice?: number;
  }>;
  logicalOperator?: 'AND' | 'OR';
  enabled: boolean;
  temporary?: boolean;
  temporaryExpireDate?: string;
  customMessage?: string;
  createdAt: string;
  updatedAt: string;
}

interface DeleteResponse {
  success: boolean;
  deletedAlertId: string;
}

/**
 * リクエストボディが不正なときの 400 レスポンス
 */
function invalidRequestBodyResponse(): NextResponse<ErrorResponse> {
  return NextResponse.json(
    {
      error: 'INVALID_REQUEST',
      message: ERROR_MESSAGES.INVALID_REQUEST_BODY,
    },
    { status: 400 }
  );
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
    temporary: alert.Temporary,
    temporaryExpireDate: alert.TemporaryExpireDate,
    createdAt: new Date(alert.CreatedAt).toISOString(),
    updatedAt: new Date(alert.UpdatedAt).toISOString(),
  };

  // LogicalOperator が存在する場合のみ追加
  if (alert.LogicalOperator) {
    response.logicalOperator = alert.LogicalOperator;
  }
  if (alert.CustomMessage) {
    response.customMessage = alert.CustomMessage;
  }

  return response;
}

/**
 * PUT /api/alerts/{id}
 * アラート更新
 */
export const PUT = withApiErrorReporting(
  'Web API: アラート更新エラー',
  withAuth(
    getSession,
    'stocks:write-own',
    async (
      session,
      request: NextRequest,
      { params }: { params: Promise<{ id: string }> }
    ): Promise<NextResponse<AlertResponse | ErrorResponse>> => {
      // パラメータの取得
      const { id: alertId } = await params;
      const userId = session.user.id;

      // リクエストボディの取得
      const bodyResult = await readJsonObjectBody(request);
      if (!bodyResult.ok) {
        return invalidRequestBodyResponse();
      }
      const { conditions, enabled, temporary, logicalOperator, customMessage } = bodyResult.body;

      // 項目の型チェック
      // 条件の要素は null (その位置は更新しない) かオブジェクトのみ許容する
      if (conditions !== undefined && !Array.isArray(conditions)) {
        return invalidRequestBodyResponse();
      }
      if (conditions !== undefined && !conditions.every((c) => c === null || isRecord(c))) {
        return invalidRequestBodyResponse();
      }
      if (enabled !== undefined && typeof enabled !== 'boolean') {
        return invalidRequestBodyResponse();
      }
      if (temporary !== undefined && typeof temporary !== 'boolean') {
        return invalidRequestBodyResponse();
      }
      if (customMessage !== undefined && typeof customMessage !== 'string') {
        return invalidRequestBodyResponse();
      }

      // リポジトリの初期化
      const alertRepo = createAlertRepository();
      const tickerRepo = createTickerRepository();
      const exchangeRepo = createExchangeRepository();

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

      if (conditions !== undefined) {
        // 条件の部分更新をサポート
        // 既存条件とインデックス対応でマージ（単一・範囲指定の両方に対応）
        // 更新値の型は未検証のため、マージ結果は取り出し (parseAlertConditionList) で絞り込む
        const mergedConditions: Array<Record<string, unknown>> = existingAlert.ConditionList.map(
          (existingCondition, index) => {
            const updateCondition: unknown = conditions[index];
            if (!isRecord(updateCondition)) return { ...existingCondition };

            const mergedCondition: Record<string, unknown> = {
              field: updateCondition.field ?? existingCondition.field,
              operator: updateCondition.operator ?? existingCondition.operator,
              value: updateCondition.value ?? existingCondition.value,
            };

            if (updateCondition.isPercentage === true) {
              mergedCondition.isPercentage = true;
              if (typeof updateCondition.percentageValue === 'number') {
                mergedCondition.percentageValue = updateCondition.percentageValue;
              }
              if (typeof updateCondition.basePrice === 'number') {
                mergedCondition.basePrice = updateCondition.basePrice;
              }
            } else if (updateCondition.isPercentage === false) {
              // 明示的に false が指定された場合はパーセンテージ情報をクリア
              mergedCondition.isPercentage = false;
            }

            return mergedCondition;
          }
        );

        const updatedConditions = parseAlertConditionList(mergedConditions);
        if (updatedConditions === null) {
          // 取り出せない条件でも、どこが不正かはバリデーションの指摘で返す
          const conditionValidation = validateAlert({
            ...existingAlert,
            ConditionList: mergedConditions,
            UpdatedAt: Date.now(),
          });
          return NextResponse.json(
            {
              error: 'INVALID_REQUEST',
              message: ERROR_MESSAGES.VALIDATION_ERROR,
              details: conditionValidation.errors,
            },
            { status: 400 }
          );
        }

        updates.ConditionList = updatedConditions;
      }

      if (enabled !== undefined) {
        updates.Enabled = enabled;
      }
      if (temporary !== undefined) {
        updates.Temporary = temporary;
        if (temporary) {
          const exchange = await exchangeRepo.getById(existingAlert.ExchangeID);
          if (!exchange) {
            return NextResponse.json(
              {
                error: 'INVALID_REQUEST',
                message: ERROR_MESSAGES.EXCHANGE_NOT_FOUND,
              },
              { status: 400 }
            );
          }
          updates.TemporaryExpireDate = calculateTemporaryExpireDate(exchange, Date.now());
        }
      }

      // LogicalOperator は 'AND' | 'OR' のみ許容（null は除外）
      if (logicalOperator !== undefined && logicalOperator !== null) {
        if (logicalOperator !== 'AND' && logicalOperator !== 'OR') {
          // 値が不正な場合も、バリデーションの指摘を返す
          const operatorValidation = validateAlert({
            ...existingAlert,
            LogicalOperator: logicalOperator,
            UpdatedAt: Date.now(),
          });
          return NextResponse.json(
            {
              error: 'INVALID_REQUEST',
              message: ERROR_MESSAGES.VALIDATION_ERROR,
              details: operatorValidation.errors,
            },
            { status: 400 }
          );
        }
        updates.LogicalOperator = logicalOperator;
      }
      if (customMessage !== undefined) {
        updates.CustomMessage = customMessage.trim().length > 0 ? customMessage.trim() : undefined;
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
        ticker?.symbol || updatedAlert.TickerID.split(':')[1] || '',
        ticker?.name || ''
      );

      return NextResponse.json(response, { status: 200 });
    }
  )
);

/**
 * DELETE /api/alerts/{id}
 * アラート削除
 */
export const DELETE = withApiErrorReporting(
  'Web API: アラート削除エラー',
  withAuth(
    getSession,
    'stocks:write-own',
    async (
      session,
      _request: NextRequest,
      { params }: { params: Promise<{ id: string }> }
    ): Promise<NextResponse<DeleteResponse | ErrorResponse>> => {
      // パラメータの取得
      const { id: alertId } = await params;
      const userId = session.user.id;

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
    }
  )
);
