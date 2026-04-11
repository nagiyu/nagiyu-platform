# Quick Clip: Lambda の Batch 依存を CloudFormation Export/Import から切り離す - 技術設計

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に重要な設計決定を docs/infra/quick-clip/architecture.md に ADR として抽出し、
    tasks/quick-clip-decouple-batch-lambda/ ディレクトリごと削除します。
-->

## 背景・問題

さくっとクリップ (Quick Clip) の CDK では、`BatchStack` から `LambdaStack` へ Job Queue ARN と
Job Definition ARN を CDK の CloudFormation トークン（`Fn::GetAtt`）で渡している。CDK はトークンが
スタックをまたぐと自動的に **CloudFormation Export/Import** を生成する。

Job Definition を更新するたびに新しいリビジョン ARN（例: `...-small:1` → `...-small:2`）が生成され、
Export 値が変わる。しかし LambdaStack が `Fn::ImportValue` で参照中の Export は CloudFormation が更新
を拒否するため、Batch 単独のデプロイが毎回失敗する。

回避策として CloudFront・Lambda を再デプロイしているが、本来不要なデプロイが発生している。

### 同様の問題を解決済みの先例

`infra/niconico-mylist-assistant/bin/niconico-mylist-assistant.ts:96-102` にコメントと実装が存在する。
`getBatchJobQueueArn` / `getBatchJobDefinitionArn` ユーティリティで命名規則から ARN を文字列リテラル
として構築し、CF Export/Import を回避している。

---

## 根本原因

| ファイル | 行 | 問題のある箇所 | 問題 |
|----------|-----|--------------|------|
| `infra/quick-clip/bin/quick-clip.ts` | 76 | `batchJobQueueArn: batchStack.jobQueueArn` | `jobQueue.attrJobQueueArn`（CF トークン）を LambdaStack に渡す → CF Export/Import 生成 |
| `infra/quick-clip/bin/quick-clip.ts` | 78 | `batchJobDefinitionArns: batchStack.jobDefinitionArns` | `attrJobDefinitionArn` × 3（CF トークン配列）を渡す → CF Export/Import × 3 生成 |

`batchJobDefinitionPrefix`（行 77）は `nagiyu-quick-clip-${env}` という JS 文字列リテラルなので問題なし。

---

## 変更方針

niconico-mylist-assistant と同じパターンを適用する。

- CF トークン（`batchStack.jobQueueArn`）の代わりに `getBatchJobQueueArn()` で ARN を文字列リテラルとして構築
- `batchJobDefinitionArns` prop を削除する
  - `lambda-stack.ts` 内の `jobDefinitionArnsWithAndWithoutVersions` が `{prefix}-{variant}` と `{prefix}-{variant}:*` の両パターンを生成済みで、全バージョンをカバーできる
  - CF トークンが提供していた「具体バージョン ARN（`:1` 等）」は `:*` ワイルドカードで代替可能

---

## 変更内容

### 1. `infra/quick-clip/bin/quick-clip.ts`

#### import 追加

```diff
 import type { QuickClipEnvironment } from '../lib/environment';
+import { getBatchJobQueueArn } from '@nagiyu/infra-common';
```

#### BatchStack 作成の直後に ARN をリテラルで構築（`lambdaStack` 作成の前）

```diff
+// Batch ARN を命名規則から直接計算し、CloudFormation Export/Import 依存を回避する
+// batchStack.jobQueueArn / jobDefinitionArns (Fn::GetAtt トークン) を渡すと CDK が自動的に
+// BatchStack に Export を作成し LambdaStack に Fn::ImportValue を生成する。
+// Job Definition の更新（リビジョン変更）時に Export 値が変わり CF が更新を拒否するため、
+// リテラル文字列で ARN を構築して Export/Import を使わない設計にする。
+const batchJobQueueArn = getBatchJobQueueArn(
+  stackEnv.region,
+  stackEnv.account!,
+  `nagiyu-quick-clip-${typedEnv}`,
+);
+
 const lambdaStack = new LambdaStack(app, `NagiyuQuickClipLambda${envSuffix}`, {
```

#### LambdaStack props の変更

```diff
   batchJobQueueArn: batchStack.jobQueueArn,    // ← 削除
+  batchJobQueueArn,                             // ← 追加（上で構築したリテラル）
   batchJobDefinitionPrefix: batchStack.jobDefinitionPrefix,
   batchJobDefinitionArns: batchStack.jobDefinitionArns,    // ← 削除
```

#### addDependency の削除

```diff
 lambdaStack.addDependency(dynamoStack);
-lambdaStack.addDependency(batchStack);
 lambdaStack.addDependency(secretsStack);
```

### 2. `infra/quick-clip/lib/lambda-stack.ts`

#### Props インターフェースから削除

```diff
   batchJobQueueArn: string;
   batchJobDefinitionPrefix: string;
-  batchJobDefinitionArns: string[];
```

#### コンストラクタの destructuring から削除

```diff
     batchJobQueueArn,
     batchJobDefinitionPrefix,
-    batchJobDefinitionArns,
     ...stackProps
```

#### batchSubmitJobResources の簡略化

```diff
-  // batchJobDefinitionArns に CloudFormation が返す具体バージョン ARN（...:1 など）が入り、
-  // 同時に明示的なパターン ARN も追加するため重複し得る。Set で重複を除外して最小化する。
   const batchSubmitJobResources = Array.from(
     new Set([
       batchJobQueueArn,
-      ...batchJobDefinitionArns,
       ...jobDefinitionArnsWithAndWithoutVersions,
     ])
   );
```

---

## 検証方法

### 1. cdk synth で CF Export/Import がないことを確認

```sh
cd infra/quick-clip
npx cdk synth --context env=dev
```

**LambdaStack に `Fn::ImportValue` がないこと:**

```sh
cat cdk.out/NagiyuQuickClipLambdaDev.template.json | grep -c ImportValue
# → 0 であること
```

**BatchStack に自動生成 Export（`ExportsOutput*`）がないこと:**

```sh
cat cdk.out/NagiyuQuickClipBatchDev.template.json | jq '[.Outputs | keys[] | select(startswith("ExportsOutput"))] | length'
# → 0 であること
# （BatchJobQueueArn など明示的な Output は残って問題なし）
```

### 2. Batch 単独デプロイの確認（dev 環境）

```sh
cd infra/quick-clip
npx cdk deploy NagiyuQuickClipBatchDev --context env=dev
# Lambda / CloudFront の再デプロイが発生しないこと
```

---

## docs/ への移行メモ

- [ ] `docs/infra/quick-clip/architecture.md`（または相当する ADR ファイル）に以下を ADR として追記すること：
    - タイトル: CloudFormation Export/Import を避け Batch ARN をリテラル構築する
    - 背景: Job Definition リビジョン更新時に Export 値が変わり Lambda スタックが Batch 単独デプロイをブロックしていた
    - 決定: `getBatchJobQueueArn()` ユーティリティで命名規則から ARN を文字列として構築
    - 影響: Batch 単独デプロイが可能になる。初回デプロイは Batch → Lambda の順序を手動または CI/CD で担保する
