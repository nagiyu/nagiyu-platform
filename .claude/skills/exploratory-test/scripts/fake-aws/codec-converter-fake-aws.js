// codec-converter を探索するための偽の AWS (DynamoDB / S3 / Batch) を 1 ポートで提供する。
// アップロードとジョブ詳細の 2 画面しかなく、インメモリ DB の切り替えも無いため、
// 実 AWS の代わりにこれへ向けて、ジョブの状態遷移と障害を自由に作る。全リクエストを記録する。
//
// 起動: node codec-converter-fake-aws.js (環境変数 FAKE_PORT、既定 43207。127.0.0.1 だけで待ち受ける)
// 接続: web を AWS_ENDPOINT_URL=http://127.0.0.1:<ポート> で起動する。ホストは IP にすること
//       (localhost だと S3 が virtual-host 形式になり、このサーバーでは受けられない)。
//       ブラウザが署名付き URL へ直接 PUT するので CORS (ETag の expose を含む) にも応える。
// 対応 API: DynamoDB の PutItem / GetItem、Batch の SubmitJob、S3 の PUT / HEAD / GET (path-style)
// 管理用エンドポイント:
//   GET  /__admin/log | /__admin/items | /__admin/objects   記録 / ジョブ一覧 / S3 オブジェクト
//   POST /__admin/job      ジョブを seed する (jobId を含む JSON)
//   POST /__admin/patch    {jobId, status, outputFile, ...} で既存ジョブを更新し、状態遷移を作る
//   POST /__admin/toggles  障害注入 {batchFail: 'jobdef'|'all', s3HeadFail, s3PutFail, ddbFail, delayMs}
const http = require('http');
const PORT = Number(process.env.FAKE_PORT || 43207);
const items = new Map(); // jobId -> DynamoDB AttributeValue map
const objects = new Map(); // bucket/key -> {size, contentType}
const log = [];
const toggles = { batchFail: null, s3HeadFail: false, ddbFail: false, s3PutFail: false, delayMs: 0 };

function marshall(v) {
  if (typeof v === 'string') return { S: v };
  if (typeof v === 'number') return { N: String(v) };
  if (typeof v === 'boolean') return { BOOL: v };
  if (v === null) return { NULL: true };
  if (typeof v === 'object') return { M: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, marshall(x)])) };
}
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,PUT,POST,HEAD,OPTIONS',
  'Access-Control-Allow-Headers': '*',
  'Access-Control-Expose-Headers': 'ETag',
};

http
  .createServer((req, res) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size < 1e6) chunks.push(c);
    });
    req.on('end', () => {
      const body = Buffer.concat(chunks).toString();
      const target = req.headers['x-amz-target'];
      const entry = { t: new Date().toISOString(), method: req.method, url: req.url, target, size, origin: req.headers.origin };
      log.push(entry);
      const send = (status, obj, headers = {}) => {
        setTimeout(() => {
          res.writeHead(status, { ...cors, ...headers });
          res.end(obj === undefined ? '' : typeof obj === 'string' ? obj : JSON.stringify(obj));
        }, toggles.delayMs);
      };
      // 管理用
      if (req.url.startsWith('/__admin')) {
        if (req.url === '/__admin/log') return send(200, log);
        if (req.url === '/__admin/items') return send(200, [...items.values()]);
        if (req.url === '/__admin/objects') return send(200, [...objects.entries()]);
        if (req.url === '/__admin/toggles' && req.method === 'POST') {
          Object.assign(toggles, JSON.parse(body || '{}'));
          return send(200, toggles);
        }
        if (req.url === '/__admin/job' && req.method === 'POST') {
          const job = JSON.parse(body);
          const m = marshall(job).M;
          items.set(job.jobId, m);
          return send(200, { ok: true });
        }
        if (req.url === '/__admin/patch' && req.method === 'POST') {
          const { jobId, ...rest } = JSON.parse(body);
          const cur = items.get(jobId) || {};
          items.set(jobId, { ...cur, ...marshall(rest).M });
          return send(200, { ok: true });
        }
        return send(404, { error: 'admin' });
      }
      if (req.method === 'OPTIONS') return send(204);
      // DynamoDB
      if (target && target.startsWith('DynamoDB_20120810.')) {
        const op = target.split('.')[1];
        const input = JSON.parse(body || '{}');
        entry.input = input;
        if (toggles.ddbFail) return send(500, { __type: 'com.amazonaws.dynamodb.v20120810#InternalServerError', message: 'fake failure' }, { 'Content-Type': 'application/x-amz-json-1.0' });
        if (!input.TableName) {
          return send(400, { __type: 'com.amazon.coral.validate#ValidationException', message: 'TableName must be non-empty' }, { 'Content-Type': 'application/x-amz-json-1.0' });
        }
        if (op === 'PutItem') {
          items.set(input.Item.jobId.S, input.Item);
          return send(200, {}, { 'Content-Type': 'application/x-amz-json-1.0' });
        }
        if (op === 'GetItem') {
          const it = items.get(input.Key.jobId.S);
          return send(200, it ? { Item: it } : {}, { 'Content-Type': 'application/x-amz-json-1.0' });
        }
        return send(400, { __type: 'UnknownOperationException', message: op }, { 'Content-Type': 'application/x-amz-json-1.0' });
      }
      // Batch
      if (req.url.startsWith('/v1/submitjob')) {
        const input = JSON.parse(body || '{}');
        entry.input = input;
        if (toggles.batchFail === 'jobdef' && !String(input.jobDefinition).endsWith('-medium')) {
          return send(400, { __type: 'ClientException', message: 'JobDefinition not found' }, { 'x-amzn-errortype': 'ClientException', 'Content-Type': 'application/json' });
        }
        if (toggles.batchFail === 'all') {
          return send(400, { __type: 'ClientException', message: 'queue disabled' }, { 'x-amzn-errortype': 'ClientException', 'Content-Type': 'application/json' });
        }
        return send(200, { jobName: input.jobName, jobId: 'fake-batch-' + Date.now(), jobArn: 'arn:fake' }, { 'Content-Type': 'application/json' });
      }
      // S3 (path-style)
      const path = decodeURIComponent(req.url.split('?')[0]).replace(/^\//, '');
      if (req.method === 'PUT') {
        if (toggles.s3PutFail) return send(403, '<Error><Code>AccessDenied</Code></Error>');
        objects.set(path, { size, contentType: req.headers['content-type'] });
        return send(200, '', { ETag: '"fake"' });
      }
      if (req.method === 'HEAD') {
        if (toggles.s3HeadFail || !objects.has(path)) return send(404);
        return send(200, undefined, { 'Content-Length': String(objects.get(path).size) });
      }
      if (req.method === 'GET') {
        return send(200, 'FAKE-VIDEO-CONTENT', { 'Content-Type': 'video/mp4' });
      }
      send(400, { error: 'unknown' });
    });
  })
  .listen(PORT, '127.0.0.1', () => console.log('fake aws on', PORT));
