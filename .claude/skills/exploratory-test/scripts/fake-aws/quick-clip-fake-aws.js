// quick-clip を探索するための偽の AWS (DynamoDB / S3 / Batch / Lambda) を 1 ポートで提供する。
// ジョブの状態は DynamoDB の batchJobId と Batch の DescribeJobs で決まり、見どころ画面は
// S3 のクリップや ZIP の有無で変わるため、これらを管理用エンドポイントで自由に作る。
// 実 AWS には一切つながない。
//
// 起動: node quick-clip-fake-aws.js (環境変数 FAKE_PORT、既定 13206。127.0.0.1 だけで待ち受ける)
// 接続: web を AWS_ENDPOINT_URL_{DYNAMODB,S3,BATCH,LAMBDA}=http://127.0.0.1:<ポート> の 4 つで起動する。
//       ホストは IP にすること (localhost だと S3 が virtual-host 形式になる)。
//       ブラウザが署名付き URL へ直接 PUT するので CORS にも応える。
//       マルチパートの ETag は CORS で expose しないと取れないため、既定で expose する (noEtagExpose で外せる)。
// 対応 API: DynamoDB の GetItem / PutItem / UpdateItem / Query、Batch の SubmitJob / DescribeJobs、
//           Lambda の Invoke (ZIP 生成とクリップ再生成の完了を、遅延つきで S3 / DynamoDB に反映する)、
//           S3 の PUT / HEAD / GET / DELETE とマルチパート
// 環境変数 FAKE_BUCKET: seed や Lambda が置く先のバケット名 (既定 qc-bucket)。web の S3_BUCKET と揃える。
// 環境変数 SAMPLE_MP4: seedHighlight が置くクリップの実体 (既定 web の tests/fixtures/sample.mp4。無ければ短いダミー)
// 管理用エンドポイント (POST、JSON。応答は現在の状態):
//   /__admin/reset | state
//   /__admin/seedJob       {jobId, batchStatus, batchStage, analysisProgress, errorMessage, fileName, expiresAt}
//   /__admin/seedHighlight {jobId, highlightId, order, startSec, endSec, status, clipStatus, ...}
//   /__admin/setBatch      {jobId, status, batchStage, analysisProgress, errorMessage} で状態を遷移させる
//   /__admin/putObject     {key, body, contentType} で S3 に直接置く (文字起こしなど)
//   /__admin/behavior      {lambdaFail, zipDelayMs, zipNever, clipDelayMs, clipResult, s3PutFail, noEtagExpose, ddbFail}
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
// 巻き上げで解決される。リポジトリの node_modules を使う前提
const { unmarshall, marshall } = require('@aws-sdk/util-dynamodb');

const PORT = Number(process.env.FAKE_PORT || 13206);
const BUCKET = process.env.FAKE_BUCKET || 'qc-bucket';
const SAMPLE_MP4 = process.env.SAMPLE_MP4 || path.resolve(__dirname, '../../../../../services/quick-clip/web/tests/fixtures/sample.mp4');

/** クリップの実体。フィクスチャが無い環境でも seed が落ちないようにする */
function sampleMp4() {
  try {
    return fs.readFileSync(SAMPLE_MP4);
  } catch {
    return Buffer.from('FAKE-MP4');
  }
}

const table = new Map(); // key: PK|SK -> plain object
const s3 = new Map(); // key: bucket/key -> {body, contentType, etag}
const multipart = new Map(); // uploadId -> {bucket,key,parts:Map}
const batchJobs = new Map(); // batchJobId -> {status, jobName, env}
const lambdaInvocations = [];
const log = [];
// 振る舞い制御
const behavior = {
  lambdaFail: false, // Lambda invoke を 500 にする
  zipDelayMs: 2000, // ZIP 生成 Lambda を受けてから clips.zip を置くまで
  zipNever: false, // ZIP を置かない
  clipDelayMs: 4000, // clip 再生成 Lambda を受けてから GENERATED にするまで
  clipResult: 'GENERATED', // or FAILED
  s3PutFail: false, // presigned PUT を 403 にする
  noEtagExpose: false,
  ddbFail: false,
};

const k = (pk, sk) => `${pk}|${sk}`;

function cors(res, req) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,HEAD,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] || '*');
  if (!behavior.noEtagExpose) res.setHeader('Access-Control-Expose-Headers', 'ETag');
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

// ---- DynamoDB ----
function parseSet(expr, names, values) {
  const body = expr.replace(/^\s*SET\s+/i, '');
  const out = {};
  for (const part of body.split(',')) {
    const [lhs, rhs] = part.split('=').map((s) => s.trim());
    const name = names?.[lhs] ?? lhs;
    out[name] = values[rhs];
  }
  return out;
}

function ddb(target, input) {
  if (behavior.ddbFail) {
    const e = new Error('fake ddb failure');
    e.code = 500;
    throw e;
  }
  switch (target) {
    case 'GetItem': {
      const key = unmarshall(input.Key);
      const item = table.get(k(key.PK, key.SK));
      return item ? { Item: marshall(item, { removeUndefinedValues: true }) } : {};
    }
    case 'PutItem': {
      const item = unmarshall(input.Item);
      table.set(k(item.PK, item.SK), item);
      return {};
    }
    case 'UpdateItem': {
      const key = unmarshall(input.Key);
      const values = input.ExpressionAttributeValues ? unmarshall(input.ExpressionAttributeValues) : {};
      const set = parseSet(input.UpdateExpression, input.ExpressionAttributeNames, values);
      const cur = table.get(k(key.PK, key.SK)) || { ...key };
      table.set(k(key.PK, key.SK), { ...cur, ...set });
      return {};
    }
    case 'Query': {
      const values = unmarshall(input.ExpressionAttributeValues);
      const pk = values[':pk'];
      const prefix = values[':highlightPrefix'] ?? '';
      const items = [...table.values()].filter((i) => i.PK === pk && String(i.SK).startsWith(prefix));
      return { Items: items.map((i) => marshall(i, { removeUndefinedValues: true })), Count: items.length };
    }
    default:
      throw new Error('unsupported ddb op ' + target);
  }
}

// ---- 管理 API ----
function seedJob({ jobId, batchStatus, batchStage, analysisProgress, errorMessage, fileName = 'movie.mp4', expiresAt }) {
  const now = Math.floor(Date.now() / 1000);
  const item = {
    PK: `JOB#${jobId}`,
    SK: `JOB#${jobId}`,
    Type: 'JOB',
    jobId,
    originalFileName: fileName,
    fileSize: 1024,
    createdAt: now,
    expiresAt: expiresAt ?? now + 86400,
  };
  if (batchStatus) {
    const bid = 'batch-' + jobId;
    batchJobs.set(bid, { status: batchStatus, jobName: 'seed' });
    item.batchJobId = bid;
  }
  if (batchStage) item.batchStage = batchStage;
  if (analysisProgress) item.analysisProgress = analysisProgress;
  if (errorMessage) item.errorMessage = errorMessage;
  table.set(k(item.PK, item.SK), item);
}

function seedHighlight(h) {
  const item = {
    PK: `JOB#${h.jobId}`,
    SK: `HIGHLIGHT#${h.highlightId}`,
    Type: 'HIGHLIGHT',
    source: 'motion',
    status: 'unconfirmed',
    clipStatus: 'GENERATED',
    expiresAt: Math.floor(Date.now() / 1000) + 86400,
    ...h,
  };
  table.set(k(item.PK, item.SK), item);
  if (item.clipStatus === 'GENERATED') {
    s3.set(`${BUCKET}/outputs/${h.jobId}/clips/${h.highlightId}.mp4`, {
      body: sampleMp4(),
      contentType: 'video/mp4',
      etag: '"seed"',
    });
  }
}

function xml(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/xml' });
  res.end(`<?xml version="1.0" encoding="UTF-8"?>${body}`);
}

const server = http.createServer(async (req, res) => {
  cors(res, req);
  const url = new URL(req.url, `http://${req.headers.host}`);
  const body = await readBody(req);
  const entry = { t: new Date().toISOString(), method: req.method, path: url.pathname + url.search.slice(0, 80), target: req.headers['x-amz-target'] };
  log.push(entry);
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    return res.end();
  }
  try {
    // 管理 API
    if (url.pathname.startsWith('/__admin/')) {
      const cmd = url.pathname.slice('/__admin/'.length);
      const payload = body.length ? JSON.parse(body.toString()) : {};
      if (cmd === 'reset') {
        table.clear(); s3.clear(); multipart.clear(); batchJobs.clear(); lambdaInvocations.length = 0; log.length = 0;
      } else if (cmd === 'seedJob') seedJob(payload);
      else if (cmd === 'seedHighlight') seedHighlight(payload);
      else if (cmd === 'setBatch') {
        const job = table.get(k(`JOB#${payload.jobId}`, `JOB#${payload.jobId}`));
        if (job?.batchJobId) batchJobs.get(job.batchJobId).status = payload.status;
        if (payload.batchStage && job) job.batchStage = payload.batchStage;
        if (payload.analysisProgress && job) job.analysisProgress = payload.analysisProgress;
        if (payload.errorMessage && job) job.errorMessage = payload.errorMessage;
      } else if (cmd === 'behavior') Object.assign(behavior, payload);
      else if (cmd === 'putObject') s3.set(payload.key, { body: Buffer.from(payload.body ?? ''), contentType: payload.contentType || 'application/octet-stream', etag: '"x"' });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(
        JSON.stringify({
          ok: true,
          behavior,
          table: [...table.values()],
          s3Keys: [...s3.keys()],
          batchJobs: [...batchJobs.entries()],
          lambdaInvocations,
          log: cmd === 'state' ? log.slice(-200) : undefined,
        })
      );
    }

    // DynamoDB
    const target = req.headers['x-amz-target'];
    if (target && target.startsWith('DynamoDB_20120810.')) {
      const op = target.split('.')[1];
      const out = ddb(op, JSON.parse(body.toString() || '{}'));
      res.writeHead(200, { 'Content-Type': 'application/x-amz-json-1.0' });
      return res.end(JSON.stringify(out));
    }

    // Batch
    if (url.pathname === '/v1/submitjob') {
      const input = JSON.parse(body.toString());
      const id = crypto.randomUUID();
      batchJobs.set(id, { status: 'SUBMITTED', jobName: input.jobName, jobDefinition: input.jobDefinition, env: input.containerOverrides?.environment });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ jobId: id, jobName: input.jobName, jobArn: 'arn:aws:batch:us-east-1:000000000000:job/' + id }));
    }
    if (url.pathname === '/v1/describejobs') {
      const input = JSON.parse(body.toString());
      const jobs = (input.jobs || []).filter((id) => batchJobs.has(id)).map((id) => ({
        jobId: id, jobName: batchJobs.get(id).jobName, status: batchJobs.get(id).status, jobQueue: 'q', jobDefinition: 'd', startedAt: 0,
      }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ jobs }));
    }

    // Lambda
    const lm = url.pathname.match(/^\/2015-03-31\/functions\/([^/]+)\/invocations$/);
    if (lm) {
      const fn = decodeURIComponent(lm[1]);
      const payload = JSON.parse(body.toString() || '{}');
      lambdaInvocations.push({ fn, payload, t: Date.now() });
      if (behavior.lambdaFail) {
        res.writeHead(500, { 'Content-Type': 'application/json', 'x-amzn-errortype': 'ServiceException' });
        return res.end(JSON.stringify({ message: 'fake lambda failure' }));
      }
      if (fn.includes('zip') && !behavior.zipNever) {
        setTimeout(() => {
          s3.set(`${BUCKET}/outputs/${payload.jobId}/clips.zip`, { body: Buffer.from('PK fake zip'), contentType: 'application/zip', etag: '"zip"' });
        }, behavior.zipDelayMs);
      }
      if (fn.includes('clip')) {
        setTimeout(() => {
          const item = table.get(k(`JOB#${payload.jobId}`, `HIGHLIGHT#${payload.highlightId}`));
          if (item) {
            item.clipStatus = behavior.clipResult;
            if (behavior.clipResult === 'GENERATED') {
              s3.set(`${BUCKET}/outputs/${payload.jobId}/clips/${payload.highlightId}.mp4`, { body: sampleMp4(), contentType: 'video/mp4', etag: '"c"' });
            }
          }
        }, behavior.clipDelayMs);
      }
      res.writeHead(202);
      return res.end('');
    }

    // S3 (path-style)
    const parts = url.pathname.split('/').filter(Boolean);
    const bucket = parts[0];
    const key = decodeURIComponent(parts.slice(1).join('/'));
    const sk = `${bucket}/${key}`;
    const q = url.searchParams;
    if (req.method === 'POST' && q.has('uploads')) {
      const uploadId = crypto.randomUUID();
      multipart.set(uploadId, { sk, parts: new Map() });
      return xml(res, 200, `<InitiateMultipartUploadResult><Bucket>${bucket}</Bucket><Key>${key}</Key><UploadId>${uploadId}</UploadId></InitiateMultipartUploadResult>`);
    }
    if (req.method === 'PUT' && q.has('partNumber') && q.has('uploadId')) {
      const mp = multipart.get(q.get('uploadId'));
      if (!mp) return xml(res, 404, '<Error><Code>NoSuchUpload</Code></Error>');
      const etag = `"${crypto.createHash('md5').update(body).digest('hex')}"`;
      mp.parts.set(Number(q.get('partNumber')), { body, etag });
      res.writeHead(200, { ETag: etag });
      return res.end();
    }
    if (req.method === 'POST' && q.has('uploadId')) {
      const mp = multipart.get(q.get('uploadId'));
      if (!mp) return xml(res, 404, '<Error><Code>NoSuchUpload</Code><Message>no upload</Message></Error>');
      const sorted = [...mp.parts.entries()].sort((a, b) => a[0] - b[0]);
      s3.set(mp.sk, { body: Buffer.concat(sorted.map((p) => p[1].body)), contentType: 'video/mp4', etag: '"mp"' });
      multipart.delete(q.get('uploadId'));
      return xml(res, 200, `<CompleteMultipartUploadResult><Bucket>${bucket}</Bucket><Key>${key}</Key><ETag>"mp"</ETag></CompleteMultipartUploadResult>`);
    }
    if (req.method === 'DELETE' && q.has('uploadId')) {
      multipart.delete(q.get('uploadId'));
      res.writeHead(204);
      return res.end();
    }
    if (req.method === 'PUT') {
      if (behavior.s3PutFail) return xml(res, 403, '<Error><Code>AccessDenied</Code></Error>');
      const etag = `"${crypto.createHash('md5').update(body).digest('hex')}"`;
      s3.set(sk, { body, contentType: req.headers['content-type'], etag });
      res.writeHead(200, { ETag: etag });
      return res.end();
    }
    if (req.method === 'HEAD' || req.method === 'GET') {
      const obj = s3.get(sk);
      if (!obj) {
        if (req.method === 'HEAD') {
          res.writeHead(404);
          return res.end();
        }
        return xml(res, 404, `<Error><Code>NoSuchKey</Code><Message>The specified key does not exist.</Message><Key>${key}</Key></Error>`);
      }
      res.writeHead(200, { 'Content-Type': obj.contentType || 'application/octet-stream', 'Content-Length': obj.body.length, ETag: obj.etag, 'Accept-Ranges': 'bytes' });
      return res.end(req.method === 'HEAD' ? undefined : obj.body);
    }
    if (req.method === 'DELETE') {
      s3.delete(sk);
      res.writeHead(204);
      return res.end();
    }
    res.writeHead(400);
    res.end('unsupported');
  } catch (e) {
    entry.error = String(e);
    res.writeHead(500, { 'Content-Type': 'application/x-amz-json-1.0' });
    res.end(JSON.stringify({ __type: 'com.amazonaws#InternalFailure', message: String(e) }));
  }
});

server.listen(PORT, '127.0.0.1', () => console.log('fake-aws listening', PORT));
