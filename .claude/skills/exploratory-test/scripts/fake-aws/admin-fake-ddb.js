// admin のエラー履歴を探索するための、最小の DynamoDB 互換サーバー。
// admin はインメモリ DB の切り替えを持たず、履歴を入れる手段も DynamoDB 経由しかない。
// 実 AWS に向けると読み書きが拒否されて画面が空になるため、こちらに向けて履歴を投入する。
//
// 起動: node admin-fake-ddb.js (環境変数 FAKE_DDB_PORT、既定 18201。127.0.0.1 だけで待ち受ける)
// 接続: admin の web を AWS_ENDPOINT_URL_DYNAMODB=http://127.0.0.1:<ポート> で起動し、
//       AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY にはダミーの値を入れる。
// 対応 API: PutItem / DeleteItem / Scan / Query (キー条件は =, <, <=, >, >=, BETWEEN, begins_with。
//           GSI は AllByOccurredAt だけ。FilterExpression は評価しない)
// 管理用エンドポイント:
//   POST /__seed  {table, items}  AttributeValue 形式の items を追加する (admin-seed.js が使う)
//   GET  /__dump                  全テーブルの中身
//   GET  /__log                   受けたリクエストの記録
const http = require('http');
const PORT = Number(process.env.FAKE_DDB_PORT || 18201);
const tables = new Map(); // name -> array of items (AttributeValue maps)
const log = [];

function S(v) { return v && (v.S ?? v.N); }
function getTable(n) { if (!tables.has(n)) tables.set(n, []); return tables.get(n); }

function evalKeyCond(expr, names = {}, values = {}, item) {
  const conds = [];
  let rest = expr;
  // AND での単純な分割は BETWEEN の AND を壊すため、条件の形ごとに拾う
  const re = /(begins_with\(\s*([#\w]+)\s*,\s*(:\w+)\s*\))|(([#\w]+)\s+BETWEEN\s+(:\w+)\s+AND\s+(:\w+))|(([#\w]+)\s*(=|>=|<=|<|>)\s*(:\w+))/gi;
  let m;
  while ((m = re.exec(rest))) {
    if (m[1]) conds.push({ op: 'begins', a: m[2], v: m[3] });
    else if (m[4]) conds.push({ op: 'between', a: m[5], v: m[6], v2: m[7] });
    else conds.push({ op: m[10], a: m[9], v: m[11] });
  }
  const nm = (a) => (a.startsWith('#') ? names[a] : a);
  return conds.every((c) => {
    const val = S(item[nm(c.a)]);
    if (val === undefined) return false;
    const x = S(values[c.v]);
    switch (c.op) {
      case 'begins': return val.startsWith(x);
      case 'between': return val >= x && val <= S(values[c.v2]);
      case '=': return val === x;
      case '>=': return val >= x;
      case '<=': return val <= x;
      case '>': return val > x;
      case '<': return val < x;
    }
    return false;
  }) ? conds : false;
}

function keyOf(item, idx) {
  if (!idx) return { PK: item.PK, SK: item.SK };
  return { PK: item.PK, SK: item.SK, GSI1PK: item.GSI1PK, GSI1SK: item.GSI1SK };
}

function handle(target, body) {
  const t = body.TableName;
  switch (target) {
    case 'PutItem': {
      const arr = getTable(t);
      const i = arr.findIndex((x) => S(x.PK) === S(body.Item.PK) && S(x.SK) === S(body.Item.SK));
      if (i >= 0) arr[i] = body.Item; else arr.push(body.Item);
      return {};
    }
    case 'DeleteItem': {
      const arr = getTable(t);
      const i = arr.findIndex((x) => S(x.PK) === S(body.Key.PK) && S(x.SK) === S(body.Key.SK));
      if (i >= 0) arr.splice(i, 1);
      return {};
    }
    case 'Scan': return { Items: getTable(t), Count: getTable(t).length };
    case 'Query': {
      const names = body.ExpressionAttributeNames || {};
      const values = body.ExpressionAttributeValues || {};
      const idx = body.IndexName;
      let rows = getTable(t).filter((it) => evalKeyCond(body.KeyConditionExpression, names, values, it));
      // GSI のソートキーは GSI1SK、テーブル本体は SK
      const skAttr = idx === 'AllByOccurredAt' ? 'GSI1SK' : 'SK';
      rows.sort((a, b) => (S(a[skAttr]) || '').localeCompare(S(b[skAttr]) || ''));
      if (body.ScanIndexForward === false) rows.reverse();
      if (body.ExclusiveStartKey) {
        const k = S(body.ExclusiveStartKey[skAttr]);
        const pos = rows.findIndex((r) => S(r[skAttr]) === k);
        if (pos < 0) throw Object.assign(new Error('The provided starting key is invalid'), { code: 'ValidationException' });
        rows = rows.slice(pos + 1);
      }
      const limit = body.Limit || rows.length;
      const out = rows.slice(0, limit);
      const res = { Items: out, Count: out.length };
      if (rows.length > limit && out.length) res.LastEvaluatedKey = keyOf(out[out.length - 1], idx);
      return res;
    }
    default:
      return {};
  }
}

http.createServer((req, res) => {
  let data = '';
  req.on('data', (c) => (data += c));
  req.on('end', () => {
    if (req.url.startsWith('/__seed')) {
      const { table, items } = JSON.parse(data);
      getTable(table).push(...items);
      res.end(JSON.stringify({ ok: true, count: getTable(table).length }));
      return;
    }
    if (req.url.startsWith('/__dump')) { res.end(JSON.stringify(Object.fromEntries(tables))); return; }
    if (req.url.startsWith('/__log')) { res.end(JSON.stringify(log)); return; }
    const target = (req.headers['x-amz-target'] || '').split('.').pop();
    let body = {};
    try { body = JSON.parse(data || '{}'); } catch {}
    log.push({ target, body });
    try {
      const out = handle(target, body);
      res.setHeader('content-type', 'application/x-amz-json-1.0');
      res.end(JSON.stringify(out));
    } catch (e) {
      res.statusCode = 400;
      res.setHeader('content-type', 'application/x-amz-json-1.0');
      res.end(JSON.stringify({ __type: 'com.amazonaws.dynamodb.v20120810#' + (e.code || 'ValidationException'), message: e.message }));
    }
  });
}).listen(PORT, '127.0.0.1', () => console.log('fake ddb on', PORT));
