// admin のエラー履歴を、admin-fake-ddb.js に投入する。
// 境界値を一通り含める: 120 件 (ページング)、長大な文字列、HTML / 制御文字、不正な context、
// 未知の severity、10 日前 / 40 日前 / 未来の日時。
//
// 実行: node admin-seed.js
// 環境変数: FAKE_DDB_URL (既定 http://127.0.0.1:18201)、ERROR_EVENTS_TABLE_NAME (既定 errors-local)
//   テーブル名は admin 側の ERROR_EVENTS_TABLE_NAME と揃える。
// キー設計は admin の履歴リポジトリに合わせる: PK=ERROR_EVENT#<サービス>、SK と GSI1SK=OCCURRED#<日時>#<id>、
//   GSI1PK=ERROR_EVENT_ALL (全サービス横断の一覧は GSI AllByOccurredAt で引く)。
const FAKE_DDB_URL = process.env.FAKE_DDB_URL || 'http://127.0.0.1:18201';
const TABLE = process.env.ERROR_EVENTS_TABLE_NAME || 'errors-local';
const now = Date.now();
const H = 3600e3;
const ev = [];
function add(e) {
  const occurredAt = e.occurredAt;
  const sk = `OCCURRED#${occurredAt}#${e.eventId}`;
  const m = (v) => ({ S: String(v) });
  ev.push({ PK: m(`ERROR_EVENT#${e.serviceId}`), SK: m(sk), GSI1PK: m('ERROR_EVENT_ALL'), GSI1SK: m(sk),
    eventId: m(e.eventId), serviceId: m(e.serviceId), source: m(e.source || 'app'), severity: m(e.severity),
    title: m(e.title), message: m(e.message), context: m(e.context ?? '{}'), occurredAt: m(occurredAt) });
}
const svcs = ['stock-tracker', 'niconico-mylist-assistant', 'livetalk', 'auth'];
const sev = ['info', 'warning', 'error', 'critical'];
for (let i = 0; i < 120; i++) {
  add({ eventId: `ev-${String(i).padStart(3, '0')}`, serviceId: svcs[i % 4], severity: sev[i % 4],
    occurredAt: new Date(now - i * 10 * 60e3).toISOString(), title: `テストエラー ${i}`, message: `メッセージ ${i}`,
    context: JSON.stringify({ i, nested: { a: [1, 2, 3] } }) });
}
add({ eventId: 'long-1', serviceId: 'stock-tracker', severity: 'critical', occurredAt: new Date(now - 5 * 60e3 + 1).toISOString(),
  title: 'とても長いタイトル'.repeat(30), message: 'A'.repeat(5000), context: '{"stack":"' + 'x'.repeat(3000) + '"}' });
add({ eventId: 'xss-1', serviceId: '<script>alert(1)</script>', severity: 'error', occurredAt: new Date(now - 6 * 60e3).toISOString(),
  title: '<img src=x onerror=alert(1)>', message: 'line1\nline2\n\tindented', context: 'not json {' });
add({ eventId: 'weird/id#1 ?&x', serviceId: 'svc with space', severity: 'warning', occurredAt: new Date(now - 7 * 60e3).toISOString(),
  title: '特殊文字 ID', message: 'm', context: '' });
add({ eventId: 'unknown-sev', serviceId: 'auth', severity: 'fatal', occurredAt: new Date(now - 8 * 60e3).toISOString(),
  title: '未知の severity', message: 'm', context: 'null' });
add({ eventId: 'old-10d', serviceId: 'auth', severity: 'info', occurredAt: new Date(now - 240 * H).toISOString(), title: '10日前', message: 'old', context: '{}' });
add({ eventId: 'old-40d', serviceId: 'auth', severity: 'info', occurredAt: new Date(now - 960 * H).toISOString(), title: '40日前', message: 'old', context: '{}' });
add({ eventId: 'future', serviceId: 'auth', severity: 'info', occurredAt: new Date(now + 2 * H).toISOString(), title: '未来', message: 'future', context: '{}' });
fetch(`${FAKE_DDB_URL}/__seed`, { method: 'POST', body: JSON.stringify({ table: TABLE, items: ev }) }).then(r => r.text()).then(console.log);
