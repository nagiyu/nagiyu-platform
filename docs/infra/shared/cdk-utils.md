# CDK 共通ユーティリティ

`infra/shared/libs/utils` に置く、CDK スタック間で共有するユーティリティの方針をまとめる。

## SSM パラメータ名

SSM パラメータ名の定義は `infra/common` (`@nagiyu/infra-common`) の `SSM_PARAMETERS` だけが持つ。`infra/shared` のスタックも各サービスのインフラもこれを import して使う。

```typescript
import { SSM_PARAMETERS } from '@nagiyu/infra-common';
```

### なぜ 1 か所に定義するか

パラメータは shared が書き込み、各サービスが読み込む。名前の文字列を双方が別々に持つと、片方だけ変えたときにずれる。ずれると読み込み側はデプロイ時にしか気づけない。定義を 1 か所にして双方が同じ値を参照することで、ずれをなくす。

### shared 側の制約

- infra-common は `dist/` のビルド成果物を参照する。shared を synth / 実行する前に `npm run build --workspace=@nagiyu/infra-common` が要る。
- infra-common の変更は shared の書き込み内容に影響するため、`infra/common/**` の変更でも shared のデプロイと検証が走る。
- キーを足すときは infra-common 側に足す。shared に写しを作らない。

## env-config.ts

環境ごとの設定を返す。環境の型 `Environment` (`'dev' | 'prod'`) もここで定義する。

**配置**: `infra/shared/libs/utils/env-config.ts`

```typescript
import { getEnvConfig } from '../libs/utils/env-config';

getEnvConfig('dev'); // { environment: 'dev', vpcCidr: '10.0.0.0/24', maxAzs: 1 }
getEnvConfig('prod'); // { environment: 'prod', vpcCidr: '10.1.0.0/24', maxAzs: 2 }
```

設定を足すときは `getEnvConfig` と `EnvConfig` を変更する。

## 関連ドキュメント

- [インフラアーキテクチャ](../architecture.md): インフラ全体の設計
- [VPC](./vpc.md): VPC の詳細
- [IAM](./iam.md): IAM の詳細
