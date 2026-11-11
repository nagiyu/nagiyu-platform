'use strict';

/**
 * auth の撮影用に、外部の 2 つをまとめて受け持つ偽のサーバー。
 *
 * - DynamoDB: ユーザーテーブルの読み取り (GetItem / Scan / Query) だけに答える。
 *   auth にはインメモリ DB へ入れる手段がなく、ユーザーを置けるのは DynamoDB だけのため。
 * - Stripe: 価格・契約・顧客の読み取りに答える。
 *   プランの画面はサーバー側で Stripe を呼ぶので、ブラウザの通信の差し替えでは届かない。
 *   サービス側の https 通信は auth-capture-preload.cjs がここへ向ける。
 *
 * 起動: node auth-fake-server.cjs (環境変数 CAPTURE_FAKE_PORT)。127.0.0.1 だけで待ち受ける。
 * 状態の入れ替え: POST /__state { users, stripe }。撮影シナリオが画面ごとに呼ぶ。
 */
const http = require('node:http');

const PORT = Number(process.env.CAPTURE_FAKE_PORT || 18203);

const EMPTY_STRIPE = { pricesFail: false, prices: [], subscriptions: [] };
let state = { users: [], stripe: EMPTY_STRIPE };

/** プレーンな値を DynamoDB の AttributeValue にする */
function marshal(value) {
  if (typeof value === 'string') return { S: value };
  if (typeof value === 'number') return { N: String(value) };
  if (typeof value === 'boolean') return { BOOL: value };
  if (value === null) return { NULL: true };
  if (Array.isArray(value)) return { L: value.map(marshal) };
  return {
    M: Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .map(([k, v]) => [k, marshal(v)])
    ),
  };
}

/** ユーザーテーブルの 1 件分の項目 (属性名は auth-core の UserMapper と同じ) */
function toItem(user) {
  const item = {
    userId: user.userId,
    Type: 'User',
    googleId: user.googleId,
    Email: user.email,
    Name: user.name,
    Roles: user.roles,
    CreatedAt: user.createdAt,
    UpdatedAt: user.updatedAt,
  };
  if (user.roleGrants !== undefined) item.RoleGrants = user.roleGrants;
  if (user.stripeCustomerId !== undefined) item.StripeCustomerId = user.stripeCustomerId;
  if (user.picture !== undefined) item.Picture = user.picture;
  if (user.lastLoginAt !== undefined) item.LastLoginAt = user.lastLoginAt;
  return Object.fromEntries(Object.entries(item).map(([k, v]) => [k, marshal(v)]));
}

function handleDynamo(target, body) {
  switch (target) {
    case 'GetItem': {
      const user = state.users.find((u) => u.userId === body.Key.userId.S);
      return user ? { Item: toItem(user) } : {};
    }
    case 'Scan': {
      const sorted = [...state.users].sort((a, b) => a.userId.localeCompare(b.userId));
      const start = body.ExclusiveStartKey
        ? sorted.findIndex((u) => u.userId === body.ExclusiveStartKey.userId.S) + 1
        : 0;
      const limit = body.Limit || sorted.length;
      const page = sorted.slice(start, start + limit);
      const result = { Items: page.map(toItem), Count: page.length };
      if (start + limit < sorted.length && page.length > 0) {
        result.LastEvaluatedKey = { userId: { S: page[page.length - 1].userId } };
      }
      return result;
    }
    case 'Query':
      return { Items: [], Count: 0 };
    default:
      return {};
  }
}

function handleStripe(method, url) {
  const { stripe } = state;
  if (method === 'GET' && url.pathname === '/v1/prices') {
    if (stripe.pricesFail) {
      return {
        status: 500,
        body: { error: { type: 'api_error', message: '撮影用に失敗させています' } },
      };
    }
    return { status: 200, body: { object: 'list', data: stripe.prices, has_more: false } };
  }
  if (method === 'GET' && url.pathname === '/v1/subscriptions') {
    return {
      status: 200,
      body: { object: 'list', data: stripe.subscriptions, has_more: false },
    };
  }
  const customer = /^\/v1\/customers\/([^/]+)$/.exec(url.pathname);
  if (method === 'GET' && customer) {
    const owner = state.users.find((u) => u.stripeCustomerId === customer[1]);
    return {
      status: 200,
      body: {
        id: customer[1],
        object: 'customer',
        metadata: owner ? { userId: owner.userId } : {},
      },
    };
  }
  return {
    status: 404,
    body: {
      error: { type: 'invalid_request_error', message: `未対応です: ${method} ${url.pathname}` },
    },
  };
}

http
  .createServer((req, res) => {
    let data = '';
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname === '/__health') {
        res.end('ok');
        return;
      }
      if (url.pathname === '/__state') {
        const next = JSON.parse(data || '{}');
        state = { users: next.users || [], stripe: { ...EMPTY_STRIPE, ...next.stripe } };
        res.end('{"ok":true}');
        return;
      }

      const target = req.headers['x-amz-target'];
      if (target) {
        res.setHeader('content-type', 'application/x-amz-json-1.0');
        res.end(
          JSON.stringify(handleDynamo(String(target).split('.').pop(), JSON.parse(data || '{}')))
        );
        return;
      }

      const result = handleStripe(req.method, url);
      res.statusCode = result.status;
      res.setHeader('content-type', 'application/json');
      res.setHeader('request-id', 'req_capture');
      res.end(JSON.stringify(result.body));
    });
  })
  .listen(PORT, '127.0.0.1', () => console.log('auth capture fake server on', PORT));
