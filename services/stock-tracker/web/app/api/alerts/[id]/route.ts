/**
 * Alert Detail API Endpoint
 *
 * PUT /api/alerts/{id} - アラート更新
 * DELETE /api/alerts/{id} - アラート削除
 *
 * Required Permission: stocks:write-own
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  validateAlert,
  calculateTemporaryExpireDate,
  createAlertRepository,
  createTickerRepository,
  createExchangeRepository,
} from '@nagiyu/stock-tracker-core';
import { EntityNotFoundError } from '@nagiyu/aws';
import { withAuth, readJsonObjectBody } from '@nagiyu/nextjs';
import { getSession } from '../../../../lib/auth';
import { withApiErrorReporting } from '../../../../lib/api-error-reporting';
import { parseAlertConditionList } from '../../../../lib/alert-condition';
import { isRecord } from '../../../../lib/request-guards';
import type { AlertEntity, UpdateAlertInput } from '@nagiyu/stock-tracker-core';
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
 * 更新内容を反映した後のアラートを組み立てる
 *
 * `null` は属性の削除を表すため、反映後は未設定になる。
 * 保存前のバリデーションを、実際に保存される内容に対して行うために使う。
 */
function applyAlertUpdates(existing: AlertEntity, updates: UpdateAlertInput): AlertEntity {
  const merged: Record<string, unknown> = { ...existing };
  for (const [key, value] of Object.entries(updates)) {
    if (value === undefined) {
      continue;
    }
    if (value === null) {
      delete merged[key];
    } else {
      merged[key] = value;
    }
  }
  return merged as unknown as AlertEntity;
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
    alertId: alert.alertId,
    tickerId: alert.tickerId,
    symbol: tickerSymbol,
    name: tickerName,
    mode: alert.mode,
    frequency: alert.frequency,
    conditions: alert.conditionList,
    enabled: alert.enabled,
    temporary: alert.temporary,
    temporaryExpireDate: alert.temporaryExpireDate,
    createdAt: new Date(alert.createdAt).toISOString(),
    updatedAt: new Date(alert.updatedAt).toISOString(),
  };

  // logicalOperator が存在する場合のみ追加
  if (alert.logicalOperator) {
    response.logicalOperator = alert.logicalOperator;
  }
  if (alert.customMessage) {
    response.customMessage = alert.customMessage;
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
      const updates: UpdateAlertInput = {};

      if (conditions !== undefined) {
        // 条件の部分更新をサポート
        // 既存条件とインデックス対応でマージ（単一・範囲指定の両方に対応）
        // 更新値の型は未検証のため、マージ結果は取り出し (parseAlertConditionList) で絞り込む
        const mergedConditions: Array<Record<string, unknown>> = existingAlert.conditionList.map(
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
            conditionList: mergedConditions,
            updatedAt: Date.now(),
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

        updates.conditionList = updatedConditions;
      }

      if (enabled !== undefined) {
        updates.enabled = enabled;
      }
      if (temporary !== undefined) {
        updates.temporary = temporary;
        if (!temporary) {
          // 一時通知を解除したら期限も不要になる。残すと一時通知でないアラートに期限が付いたままになる
          updates.temporaryExpireDate = null;
        } else {
          const exchange = await exchangeRepo.getById(existingAlert.exchangeId);
          if (!exchange) {
            return NextResponse.json(
              {
                error: 'INVALID_REQUEST',
                message: ERROR_MESSAGES.EXCHANGE_NOT_FOUND,
              },
              { status: 400 }
            );
          }
          updates.temporaryExpireDate = calculateTemporaryExpireDate(exchange, Date.now());
        }
      }

      // logicalOperator は 'AND' | 'OR' のみ許容（null は除外）
      if (logicalOperator !== undefined && logicalOperator !== null) {
        if (logicalOperator !== 'AND' && logicalOperator !== 'OR') {
          // 値が不正な場合も、バリデーションの指摘を返す
          const operatorValidation = validateAlert({
            ...existingAlert,
            logicalOperator,
            updatedAt: Date.now(),
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
        updates.logicalOperator = logicalOperator;
      }
      if (customMessage !== undefined) {
        // 空文字は「消す」の意図なので、undefined (変更なし) ではなく null (属性削除) を渡す
        updates.customMessage = customMessage.trim().length > 0 ? customMessage.trim() : null;
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
        ...applyAlertUpdates(existingAlert, updates),
        updatedAt: Date.now(),
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
      let updatedAlert: AlertEntity;
      try {
        updatedAlert = await alertRepo.update(userId, alertId, updates);
      } catch (error) {
        // 取得から更新までの間に削除された場合
        if (error instanceof EntityNotFoundError) {
          return NextResponse.json(
            {
              error: 'NOT_FOUND',
              message: ERROR_MESSAGES.ALERT_NOT_FOUND,
            },
            { status: 404 }
          );
        }
        throw error;
      }

      // TickerリポジトリでSymbolとNameを取得
      const ticker = await tickerRepo.getById(updatedAlert.tickerId);

      // レスポンス形式に変換
      const response = mapAlertToResponse(
        updatedAlert,
        ticker?.symbol || updatedAlert.tickerId.split(':')[1] || '',
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
      try {
        await alertRepo.delete(userId, alertId);
      } catch (error) {
        if (error instanceof EntityNotFoundError) {
          return NextResponse.json(
            {
              error: 'NOT_FOUND',
              message: ERROR_MESSAGES.ALERT_NOT_FOUND,
            },
            { status: 404 }
          );
        }
        throw error;
      }

      // レスポンス
      const response: DeleteResponse = {
        success: true,
        deletedAlertId: alertId,
      };

      return NextResponse.json(response, { status: 200 });
    }
  )
);
