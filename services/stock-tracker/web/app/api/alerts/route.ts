/**
 * Alerts API Endpoint
 *
 * GET /api/alerts - アラート一覧取得
 * POST /api/alerts - アラート作成（Web Push サブスクリプション含む）
 *
 * Required Permission: stocks:write-own (POST), stocks:read (GET)
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  TickerRepository,
  DynamoDBAlertRepository,
  getAuthError,
  validateAlert,
} from '@nagiyu/stock-tracker-core';
import { getDynamoDBClient, getTableName } from '../../../lib/dynamodb';
import { getSession } from '../../../lib/auth';
import type { AlertEntity } from '@nagiyu/stock-tracker-core';

/**
 * エラーメッセージ定数
 */
const ERROR_MESSAGES = {
  INVALID_LIMIT: 'limit は 1 から 100 の間で指定してください',
  INVALID_REQUEST_BODY: 'リクエストボディが不正です',
  VALIDATION_ERROR: '入力データが不正です',
  INTERNAL_ERROR: 'アラートの取得に失敗しました',
  CREATE_ERROR: 'アラートの登録に失敗しました',
  SUBSCRIPTION_REQUIRED: 'Web Push サブスクリプション情報が必要です',
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

interface AlertsListResponse {
  alerts: AlertResponse[];
  pagination: {
    count: number;
    lastKey?: string;
  };
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
 * GET /api/alerts
 * アラート一覧取得
 */
export async function GET(
  request: NextRequest
): Promise<NextResponse<AlertsListResponse | ErrorResponse>> {
  try {
    // 認証・権限チェック
    const session = await getSession();
    const authError = getAuthError(session, 'stocks:read');

    if (authError) {
      return NextResponse.json(
        {
          error: authError.statusCode === 401 ? 'UNAUTHORIZED' : 'FORBIDDEN',
          message: authError.message,
        },
        { status: authError.statusCode }
      );
    }

    // クエリパラメータの取得
    const { searchParams } = new URL(request.url);
    const limitParam = searchParams.get('limit');
    const lastKeyParam = searchParams.get('lastKey');

    // limit のバリデーション
    const limit = limitParam ? parseInt(limitParam, 10) : 50;
    if (isNaN(limit) || limit < 1 || limit > 100) {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: ERROR_MESSAGES.INVALID_LIMIT,
        },
        { status: 400 }
      );
    }

    // lastKey のバリデーション（base64 形式であることを確認）
    if (lastKeyParam) {
      try {
        // base64 デコードの検証（例外が発生すれば無効）
        Buffer.from(lastKeyParam, 'base64').toString('utf-8');
      } catch {
        return NextResponse.json(
          {
            error: 'INVALID_REQUEST',
            message: 'lastKey の形式が不正です',
          },
          { status: 400 }
        );
      }
    }

    // DynamoDBクライアントとリポジトリの初期化
    const docClient = getDynamoDBClient();
    const tableName = getTableName();
    const alertRepo = new DynamoDBAlertRepository(docClient, tableName);

    // ユーザーIDを取得
    const userId = session!.user.userId;

    // アラート一覧取得（新しいリポジトリの形式に合わせる）
    const result = await alertRepo.getByUserId(userId, {
      limit,
      cursor: lastKeyParam || undefined,
    });

    // TickerリポジトリでSymbolとNameを取得
    // TODO: Phase 1では簡易実装（N+1問題あり）。Phase 2でバッチ取得に最適化
    const tickerRepo = new TickerRepository(docClient, tableName);

    const alerts: AlertResponse[] = [];
    for (const alert of result.items) {
      const ticker = await tickerRepo.getById(alert.TickerID);
      alerts.push(
        mapAlertToResponse(
          alert,
          ticker?.Symbol || alert.TickerID.split(':')[1] || '',
          ticker?.Name || ''
        )
      );
    }

    // レスポンス形式に変換（新しいリポジトリではnextCursorが既にbase64エンコード済み）
    const response: AlertsListResponse = {
      alerts,
      pagination: {
        count: alerts.length,
        ...(result.nextCursor && { lastKey: result.nextCursor }),
      },
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('Error fetching alerts:', error);
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: ERROR_MESSAGES.INTERNAL_ERROR,
      },
      { status: 500 }
    );
  }
}

/**
 * POST /api/alerts
 * アラート作成（Web Push サブスクリプション含む）
 */
export async function POST(
  request: NextRequest
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

    // ユーザーIDを取得
    const userId = session!.user.userId;

    // Web Push サブスクリプション情報の確認
    if (!body.subscription || typeof body.subscription !== 'object') {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: ERROR_MESSAGES.SUBSCRIPTION_REQUIRED,
        },
        { status: 400 }
      );
    }

    const subscription = body.subscription;
    if (!subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: ERROR_MESSAGES.SUBSCRIPTION_REQUIRED,
        },
        { status: 400 }
      );
    }

    // ExchangeID の自動取得（tickerId から）
    const exchangeId = body.exchangeId || body.tickerId?.split(':')[0] || '';

    // リクエストボディから Alert オブジェクトを構築
    // Note: AlertID, CreatedAt, UpdatedAt はリポジトリで自動生成される
    // バリデーション用プレースホルダー（実際のIDはリポジトリで生成）
    const VALIDATION_PLACEHOLDER_UUID = '00000000-0000-4000-8000-000000000000';

    const alertData = {
      UserID: userId,
      TickerID: body.tickerId,
      ExchangeID: exchangeId,
      Mode: body.mode,
      Frequency: body.frequency,
      Enabled: body.enabled !== undefined ? body.enabled : true,
      ConditionList: body.conditions || [],
      LogicalOperator: body.logicalOperator,
      SubscriptionEndpoint: subscription.endpoint,
      SubscriptionKeysP256dh: subscription.keys.p256dh,
      SubscriptionKeysAuth: subscription.keys.auth,
      // AlertID は UUID v4 でリポジトリが自動生成
      AlertID: VALIDATION_PLACEHOLDER_UUID,
      CreatedAt: Date.now(),
      UpdatedAt: Date.now(),
    };

    // バリデーション
    const validationResult = validateAlert(alertData);
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

    // DynamoDBクライアントとリポジトリの初期化
    const docClient = getDynamoDBClient();
    const tableName = getTableName();
    const alertRepo = new DynamoDBAlertRepository(docClient, tableName);

    // アラートを作成（新しいリポジトリの形式に合わせる）
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { AlertID, CreatedAt, UpdatedAt, ...alertDataForCreate } = alertData;

    const createdAlert = await alertRepo.create(alertDataForCreate);

    // TickerリポジトリでSymbolとNameを取得
    const tickerRepo = new TickerRepository(docClient, tableName);
    const ticker = await tickerRepo.getById(createdAlert.TickerID);

    // レスポンス形式に変換
    const response = mapAlertToResponse(
      createdAlert,
      ticker?.Symbol || createdAlert.TickerID.split(':')[1] || '',
      ticker?.Name || ''
    );

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    console.error('Error creating alert:', error);
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: ERROR_MESSAGES.CREATE_ERROR,
      },
      { status: 500 }
    );
  }
}
