/**
 * Alerts API Endpoint
 *
 * GET /api/alerts - アラート一覧取得
 * POST /api/alerts - アラート作成（Web Push サブスクリプション含む）
 *
 * Required Permission: stocks:write-own (POST), stocks:read (GET)
 */

import { NextRequest, NextResponse } from 'next/server';
import { validateAlert, calculateTemporaryExpireDate } from '@nagiyu/stock-tracker-core';
import { withAuth, parsePagination, handleApiError } from '@nagiyu/nextjs';
import {
  createAlertRepository,
  createTickerRepository,
  createExchangeRepository,
} from '../../../lib/repository-factory';
import { getSession } from '../../../lib/auth';
import type { AlertEntity, CreateAlertInput } from '@nagiyu/stock-tracker-core';
import type { ErrorResponse } from '@nagiyu/common';

/**
 * エラーメッセージ定数
 */
const ERROR_MESSAGES = {
  INVALID_REQUEST_BODY: 'リクエストボディが不正です',
  VALIDATION_ERROR: '入力データが不正です',
  CREATE_ERROR: 'アラートの登録に失敗しました',
  SUBSCRIPTION_REQUIRED: 'Web Push サブスクリプション情報が必要です',
  EXCHANGE_NOT_FOUND: '取引所情報が見つかりません',
  NOTIFICATION_TITLE_REQUIRED: '通知タイトルは必須です',
  NOTIFICATION_BODY_REQUIRED: '通知本文は必須です',
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
  notificationTitle?: string;
  notificationBody?: string;
  createdAt: string;
  updatedAt: string;
}

interface CreateAlertRequest {
  tickerId: string;
  exchangeId?: string;
  mode: AlertEntity['Mode'];
  frequency: AlertEntity['Frequency'];
  conditions?: AlertEntity['ConditionList'];
  logicalOperator?: AlertEntity['LogicalOperator'];
  enabled?: boolean;
  temporary?: boolean;
  notificationTitle?: string;
  notificationBody?: string;
  subscription?: {
    endpoint?: string;
    keys?: {
      p256dh?: string;
      auth?: string;
    };
  };
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
  if (alert.NotificationTitle) {
    response.notificationTitle = alert.NotificationTitle;
  }
  if (alert.NotificationBody) {
    response.notificationBody = alert.NotificationBody;
  }

  return response;
}

/**
 * GET /api/alerts
 * アラート一覧取得
 */
export const GET = withAuth(
  getSession,
  'stocks:read',
  async (session, request: NextRequest): Promise<NextResponse> => {
    try {
      // リポジトリの初期化
      const alertRepo = createAlertRepository();
      const tickerRepo = createTickerRepository();

      // ユーザーIDを取得
      const userId = session.user.userId;

      // アラート一覧取得
      const result = await alertRepo.getByUserId(userId, parsePagination(request));

      // TickerリポジトリでSymbolとNameを取得
      // TODO: Phase 1では簡易実装（N+1問題あり）。Phase 2でバッチ取得に最適化

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

      // レスポンス形式に変換
      return NextResponse.json(
        {
          alerts,
          pagination: {
            count: alerts.length,
            ...(result.nextCursor && { lastKey: result.nextCursor }),
          },
        },
        { status: 200 }
      );
    } catch (error) {
      return handleApiError(error);
    }
  }
);

/**
 * POST /api/alerts
 * アラート作成（Web Push サブスクリプション含む）
 */
export const POST = withAuth(
  getSession,
  'stocks:write-own',
  async (session, request: NextRequest): Promise<NextResponse<AlertResponse | ErrorResponse>> => {
    try {
      // リクエストボディの取得
      let body: CreateAlertRequest;
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
      const userId = session.user.userId;

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

      if (typeof body.notificationTitle !== 'string' || body.notificationTitle.trim() === '') {
        return NextResponse.json(
          {
            error: 'INVALID_REQUEST',
            message: ERROR_MESSAGES.NOTIFICATION_TITLE_REQUIRED,
          },
          { status: 400 }
        );
      }

      if (typeof body.notificationBody !== 'string' || body.notificationBody.trim() === '') {
        return NextResponse.json(
          {
            error: 'INVALID_REQUEST',
            message: ERROR_MESSAGES.NOTIFICATION_BODY_REQUIRED,
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

      const alertData: AlertEntity = {
        UserID: userId,
        TickerID: body.tickerId,
        ExchangeID: exchangeId,
        Mode: body.mode,
        Frequency: body.frequency,
        Enabled: body.enabled !== undefined ? body.enabled : true,
        ConditionList: body.conditions || [],
        LogicalOperator: body.logicalOperator,
        Temporary: body.temporary === true ? true : undefined,
        TemporaryExpireDate: undefined,
        NotificationTitle: body.notificationTitle.trim(),
        NotificationBody: body.notificationBody.trim(),
        subscription: {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.keys.p256dh,
            auth: subscription.keys.auth,
          },
        },
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

      // リポジトリの初期化
      const alertRepo = createAlertRepository();
      const tickerRepo = createTickerRepository();
      const exchangeRepo = createExchangeRepository();

      // アラートを作成（新しいリポジトリの形式に合わせる）
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { AlertID, CreatedAt, UpdatedAt, ...alertDataForCreate } = alertData;
      const createInput: CreateAlertInput = { ...alertDataForCreate };

      if (body.temporary === true) {
        const exchange = await exchangeRepo.getById(exchangeId);
        if (!exchange) {
          return NextResponse.json(
            {
              error: 'INVALID_REQUEST',
              message: ERROR_MESSAGES.EXCHANGE_NOT_FOUND,
            },
            { status: 400 }
          );
        }
        createInput.Temporary = true;
        createInput.TemporaryExpireDate = calculateTemporaryExpireDate(exchange, Date.now());
      }

      const createdAlert = await alertRepo.create(createInput);

      // TickerリポジトリでSymbolとNameを取得
      const ticker = await tickerRepo.getById(createdAlert.TickerID);

      // レスポンス形式に変換
      const response = mapAlertToResponse(
        createdAlert,
        ticker?.Symbol || createdAlert.TickerID.split(':')[1] || '',
        ticker?.Name || ''
      );

      return NextResponse.json(response, { status: 201 });
    } catch (error) {
      return handleApiError(error);
    }
  }
);
