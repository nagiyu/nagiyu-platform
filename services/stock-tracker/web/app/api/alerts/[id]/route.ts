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
  TickerRepository,
  AlertRepository,
  getAuthError,
  validateAlert,
  AlertNotFoundError,
} from '@nagiyu/stock-tracker-core';
import { getDynamoDBClient, getTableName } from '../../../../lib/dynamodb';
import { getSession } from '../../../../lib/auth';
import type { Alert } from '@nagiyu/stock-tracker-core';

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
function mapAlertToResponse(alert: Alert, tickerSymbol: string, tickerName: string): AlertResponse {
  return {
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
}

/**
 * PUT /api/alerts/{id}
 * アラート更新
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<AlertResponse | ErrorResponse>> {
  try {
    // 認証・権限チェック
    const session = await getSession();
    const authError = getAuthError(session, 'stocks:write-own');

    if (authError) {
      return NextResponse.json(
        {
          error: authError.statusCode === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN',
          message: authError.message,
        },
        { status: authError.statusCode }
      );
    }

    // パラメータの取得
    const { id: alertId } = await params;
    const userId = session!.user.userId;

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

    // 更新可能なフィールドを抽出
    const updates: Partial<Alert> = {};

    if (body.conditions !== undefined) {
      updates.ConditionList = body.conditions;
    }

    if (body.enabled !== undefined) {
      updates.Enabled = body.enabled;
    }

    if (body.frequency !== undefined) {
      updates.Frequency = body.frequency;
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

    // DynamoDBクライアントとリポジトリの初期化
    const docClient = getDynamoDBClient();
    const tableName = getTableName();
    const alertRepo = new AlertRepository(docClient, tableName);

    // 既存アラートを取得（バリデーション用）
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
    const tickerRepo = new TickerRepository(docClient, tableName);
    const ticker = await tickerRepo.getById(updatedAlert.TickerID);

    // レスポンス形式に変換
    const response = mapAlertToResponse(
      updatedAlert,
      ticker?.Symbol || updatedAlert.TickerID.split(':')[1] || '',
      ticker?.Name || ''
    );

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    if (error instanceof AlertNotFoundError) {
      return NextResponse.json(
        {
          error: 'NOT_FOUND',
          message: ERROR_MESSAGES.ALERT_NOT_FOUND,
        },
        { status: 404 }
      );
    }

    console.error('Error updating alert:', error);
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: ERROR_MESSAGES.UPDATE_ERROR,
      },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/alerts/{id}
 * アラート削除
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<NextResponse<DeleteResponse | ErrorResponse>> {
  try {
    // 認証・権限チェック
    const session = await getSession();
    const authError = getAuthError(session, 'stocks:write-own');

    if (authError) {
      return NextResponse.json(
        {
          error: authError.statusCode === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN',
          message: authError.message,
        },
        { status: authError.statusCode }
      );
    }

    // パラメータの取得
    const { id: alertId } = await params;
    const userId = session!.user.userId;

    // DynamoDBクライアントとリポジトリの初期化
    const docClient = getDynamoDBClient();
    const tableName = getTableName();
    const alertRepo = new AlertRepository(docClient, tableName);

    // アラートを削除
    await alertRepo.delete(userId, alertId);

    // レスポンス
    const response: DeleteResponse = {
      success: true,
      deletedAlertId: alertId,
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    if (error instanceof AlertNotFoundError) {
      return NextResponse.json(
        {
          error: 'NOT_FOUND',
          message: ERROR_MESSAGES.ALERT_NOT_FOUND,
        },
        { status: 404 }
      );
    }

    console.error('Error deleting alert:', error);
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: ERROR_MESSAGES.DELETE_ERROR,
      },
      { status: 500 }
    );
  }
}
