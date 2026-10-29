# テスト戦略

## 目的

本ドキュメントは、プラットフォームにおけるテスト方針と戦略を定義する。

## 基本方針

- **スマホファースト**: モバイル環境でのテストを優先
- **品質とスピードのバランス**: 必要十分なテストカバレッジを目指す
- **自動化**: CI/CDで継続的にテストを実行

## テスト戦略（層別の責務）

テストとドキュメントの対応関係（V字モデル）は [flow.md](./flow.md) を参照。本節は各層が **何を担保し、何を担保しないか** を定める。目的は「テストが green であることが、実際に動くことを意味する」状態を保つこと。

### 層別の責務分担

| 層 | 担保すること | 担保しないこと | 実行環境 |
|---|---|---|---|
| 単体テスト | ビジネスロジック、データアクセス層（DynamoDB 実装）の契約、抽出コンポーネントの描画バリエーション | 実アプリの配線・実インフラ | Jest（決定的） |
| E2E テスト | 各ユースケースがE2Eで満たされること（配線・画面遷移を含む） | 組合せの網羅、実 AWS の挙動 | Playwright + InMemory（決定的） |
| dev 結合環境 | 実インフラ差分（実 DynamoDB・実 auth・IAM・デプロイ/起動） | 単体・E2E で担保済みの内部ロジック | 実 AWS（デプロイ先） |

各層は「その事象を実際に検知できる最も安い層」に責務を持たせる。上位層は下位層で捕まえられないものだけを担う。

### E2E の定義：ユースケース・トレーサブル／代表例／決定的

- **UC を満たすことを担保する**。メインフローに限らず、仕様に含まれる主要な例外フロー（権限拒否・入力エラー・not found・空状態など）も対象とする。「ハッピーパスに限る」ものではない。
- **網羅列挙はしない**。各フローは代表ケースで通しで証明し、組合せ網羅（全バリデーション・ロール×状態の全組合せ）は単体テストに委ねる。
- **決定的であること（MUST）**: 実行結果が一意に定まること。固定データ（InMemory）と、テスト単位で seed したロール／状態を前提とする。
- **形骸化テストの禁止（MUST NOT）**: 実行時の分岐で複数の結末を許容するテスト（例:「表示されれば A、されなければ B」を検証）や、期待状態が無いと自らスキップするテストを書かない。どちらに転んでも成功するテストは「壊れても落ちない」ため、E2E の価値を失う。**1 テスト = 1 結末**で assert する。UC の例外フローは、条件分岐で吸収するのではなく、ロール／状態を固定した独立したテストとして書く。

### データアクセス層と等価性の担保

- E2E は実 AWS を叩かず **InMemory リポジトリ**で動く（決定性と速度のため）。設計の背景は [data-access-layer.md](./data-access-layer.md) を参照。
- InMemory は DynamoDB の**近似実装**であり、等価性はコード構造では保証されない（GSI の存在・射影、ソート順、条件式などで乖離しうる）。
- したがって **等価性は DynamoDB Local を用いた契約テストで担保する**。実装非依存の振る舞い仕様を InMemory と DynamoDB Local の双方で回し、片方でしか通らない差分を検知する。あわせて、本番に載る DynamoDB 実装自体も DynamoDB Local に対して検証する。
- DynamoDB Local は AWS 純正・実 API 準拠で、CI の service container として動く（実クラウド接続・認証情報・課金は不要）。トランザクション競合例外など一部の挙動は再現しないため、その検証はモックで補う。

#### 契約テストの実行方法

- 契約テストは通常のユニットテスト（`npm test`）から隔離し、専用スクリプト（例: `test:contract`）で実行する。DynamoDB Local への接続を前提とし、接続できない場合は自己スキップせず失敗させる（決定的に検知するため）。
- ローカル: DynamoDB Local コンテナ（`docker run -p 8000:8000 amazon/dynamodb-local`）を起動してから、対象ワークスペースの契約テストを実行する。Docker デーモンが使えない環境（Claude on Web）での起動手順は [claude-environment.md](./claude-environment.md) を参照。
- CI: サービスの verify ワークフローが、`test:contract` スクリプトを持つワークスペースを対象に、DynamoDB Local を service container として起動した専用ジョブで実行する。契約テストを足すときは、スクリプトを用意すれば CI にかかる (ワークフローの変更は要らない)。

#### 契約に書いてよいもの・書いてはいけないもの

- 契約が固定してよいのは、**実 DynamoDB が仕様として保証している振る舞い**だけである。近似実装は決定的に振る舞うため、観測できた挙動をそのまま契約にすると、実 DynamoDB が保証していない順序まで仕様として固定してしまう。全件走査の結果順序が典型例で、近似実装では投入順に安定するが実 DynamoDB は順序を保証しない。これを契約にすると近似実装の都合を正としたことになる。
- 同一リポジトリの中でも、メソッドごとに絞り込み条件が異なることがある。「他のメソッドと揃っているはず」という前提で契約を書くと、実装の誤りではなく**書き手の思い込みを固定する**。契約にする前に、両実装の振る舞いをメソッド単位で確認する。
- **両実装で通るテストにも価値はあるが、それは乖離検知ではない**。射影と復元の整合ガードのように、今日は両実装とも通り、将来いずれか片方だけが落ちるためのテストがある。位置づけを取り違えると「乖離を検知できている」と誤読されるため、その意図はテスト側に明示しておく。

#### フィクスチャは境界そのものを狙う

乖離は境界にしか現れないことが多い。既定ページサイズ、ちょうど使い切る件数、その倍数といった値である。件数を「多め」に積むだけでは足りない。実際に、既定 50 件のメソッドに対して 130 件のフィクスチャを用意してもなお「ちょうど 50 件で終わる」境界は抜けていた。

狙う値を決めるには、まず**そのメソッドの既定ページサイズを確認する**こと。既定値は共通ストア側とリポジトリ実装側の二段になっており、両者は一致していない。リポジトリが自前の既定を持つか、ストアの既定に委ねるかでフィクスチャに必要な件数が変わる。

あわせて、**追加した契約が修正前の実装であれば落ちることを実測で確認する**。その契約に回帰検知力があるかどうかを確かめる手段はこれしかない。全テストが通っている状態は、契約が正しいことを何も意味しない。

#### 乖離を見つけたときの扱い

- 解消の方向は原則として**近似実装を実 DynamoDB に寄せる**。実 DynamoDB が正であり、逆向きに揃えることは乖離を仕様として追認することになる。どちらを直すかが設計判断になる場合は、独断で決めず人に判断を仰ぐ。
- **等価性を揃えると、呼び出し元の不具合が初めて顕在化することがある**。近似実装が実 DynamoDB より多く返していたために、本番では起きている打ち切りが E2E では再現していなかった、という形で現れる。等価性の担保と呼び出し元の修正はスコープが別なので、切り分けて扱う。

### dev 結合環境の位置づけ

- dev 結合環境（実 AWS）は V字のテスト階層ではなく **デプロイ先**である。ここでの確認は「実インフラ差分」に限る。
- 下位層（単体の網羅・E2E の UC 担保・契約テストによる等価性）が保たれていれば、dev での確認は **ワンパスの反映確認**まで縮められる。これが目標状態であり、dev で内部ロジックの QA をやり直している状態は、下位層の責務漏れのサインとみなす。

## テストディレクトリ構成

### 標準構成

#### サービス

```
services/{service-name}/
├── tests/
│   ├── unit/           # ユニットテスト（Jest）
│   └── e2e/            # E2Eテスト（Playwright）
```

#### ライブラリ

```
libs/{library-name}/
├── tests/
│   ├── unit/           # ユニットテスト（Jest）
│   └── setup.ts        # Jest セットアップファイル
```

### 設計思想

- **統一性**: サービスもライブラリも同じ `tests/` 配下にテストを配置
- **分離**: テストコードを `tests/` 配下に集約し、実装コード（`src/`）と明確に区分
- **型安全性**: ライブラリでは `tests/` を TypeScript の型チェック対象に含める（詳細は [shared-libraries.md](./shared-libraries.md) 参照）

#### ライブラリでE2Eテストがない理由

- ライブラリは再利用可能なコンポーネント・ユーティリティの提供が責務
- E2Eテストはサービス側で実施（実際のユーザーフローをテスト）
- ライブラリではユニットテストで品質を担保

## ユニットテスト

### フレームワーク

- **Jest**: テストランナー
- **Testing Library**: Reactコンポーネントテスト

### テスト対象

- **ビジネスロジック（lib/）を重点的に**: 純粋関数、データ変換処理
- **重要なユーティリティ関数**: エラーハンドリング、バリデーション
- **複雑なコンポーネントロジック**: 状態管理、条件分岐

### カバレッジ目標

- **ビジネスロジック: 80%以上**
- UI層は必要に応じて（E2Eでカバーされる部分は省略可）

### 共通設定

`configs/jest.config.base.ts` を extends して使用。詳細は [configs.md](./configs.md) を参照。

### モック対象

- ブラウザAPI（navigator.clipboard、localStorage等）
- 外部API呼び出し
- Next.jsルーティング

## E2Eテスト

### フレームワーク

- **Playwright**: クロスブラウザE2Eテスト

### テスト対象

- **主要な機能フロー**: ユーザーが実行する典型的な操作
- **クリティカルパス**: 必ず動作すべき重要機能
- **PWA機能**: オフライン動作、インストール（PWA対応サービスのみ）

### フィクスチャ（ロール／状態の per-test 差し替え）

「E2E の定義」で述べたとおり、UC の例外フロー（権限拒否・not found 等）は**ロール／状態を固定した独立テスト**として決定的に書く。従来 `.env.test` の `TEST_USER_ROLES` は web サーバープロセス起動時に固定され、テストごとにロールを変えられなかった。これが「admin なら表示／それ以外はリダイレクト」を 1 テストで両方飲む `if/else`（形骸化）の直接原因だった。これを解消するため、以下を標準手段とする（初出は stock-tracker。他サービスへは順次展開する）。

#### ロール／権限の差し替え（リクエストヘッダ + フィクスチャ）

- テストは Playwright フィクスチャの `role` オプション（`test.use({ role: [...] })`）でロールを宣言する。フィクスチャは全 HTTP リクエスト（ページ遷移・`request` の双方）に `x-test-user-roles`（`,` 区切り）ヘッダを付与する。
- `@nagiyu/nextjs` の `createSessionGetter` と `createClientSessionGetHandler` は、**`SKIP_AUTH_CHECK=true` のテスト専用経路でのみ**このヘッダを読み、テストセッションのロールを上書きする（ヘッダ名は `TEST_USER_ROLES_HEADER`）。ヘッダ未設定時は従来どおり `TEST_USER_ROLES` 環境変数にフォールバックするため、フィクスチャを使わない既存テストは影響を受けない。
- **本番安全性**: `SKIP_AUTH_CHECK` は本番／公開環境では有効化されない前提であり、その経路の外ではヘッダを一切読まない（`headers()` すら呼ばない）。権限昇格の新規経路は生じない。
- 権限ゲート（`withAuth` の `requiredPermission` や middleware の権限判定）を**実際に評価**させたうえで結果を固定できるため、権限拒否（403）を条件分岐なしの独立テストとして書ける。

#### ロール差し替えが効く範囲

ヘッダを解釈するのは `@nagiyu/nextjs` の次の 2 つで、いずれも `SKIP_AUTH_CHECK=true` のときだけ働く。ロールの解決順は共通で、ヘッダ → `TEST_USER_ROLES` → サービスの既定ロールとなる。

| 経路 | 解釈する関数 |
|---|---|
| API ルート・Server Component（権限ゲートを含む） | `createSessionGetter` |
| Client Component の `useSession()`（`/api/auth/session`） | `createClientSessionGetHandler` |

- ロール文字列は `,` で分割し、trim と空要素の除去を行う。結果が空なら未設定扱いとなり、`TEST_USER_ROLES=""` も既定ロールに戻る（`parseTestUserRoles`）。
- クライアント向けの経路は、`[...nextauth]/route.ts` の GET を `createClientSessionGetHandler` で包んで有効にする。サーバー側と同じユーザー・ロール・有効期限（30 日）を返すため、画面上の出し分けがクライアントのセッションに依存していても、`role` の宣言だけで検証したい状態になる。
- 新しいサービスでこの経路を使うときは、`createSessionGetter` と `createClientSessionGetHandler` に同じ `defaultRoles` を渡すこと。これを怠ると、サーバー側とクライアント側でロールの既定値が食い違う。

**「ボタンが表示されないこと」のような否定的な assert は、クライアントセッションの取得完了前だと無条件に通る**点には引き続き注意する。これは「壊れても落ちない」状態であり、実際に一部環境でのみ失敗する不安定なテストの原因になった。否定を assert する前に、`/api/auth/session` のレスポンスが期待ロールであることを `page.waitForResponse`（`goto` より前に待ち受ける）で確認し、さらにセッションに依存して描画される肯定的な要素（例: ヘッダのアカウントメニュー）が見えるまで待つこと。レスポンスを受け取っただけでは React への反映完了を保証しないため、時間待ちでは代替しない。

#### 初期状態の seed／リセット（テスト用エンドポイント）

- テストプロセスは web サーバーと別プロセスのため、InMemory リポジトリの状態は HTTP 経由でしか操作できない。そこで **`USE_IN_MEMORY_DB=true` のときのみ有効なテスト用エンドポイント**（例: `POST/DELETE /api/test/reset`）でリセット／seed する。`USE_IN_MEMORY_DB` 以外では 404 を返し、本番相当環境では不活性。
- リセットは各サービスの共有ストア初期化（例: `clearMemoryStore()`）に委譲し、seed はリポジトリの `create` 経路で投入する。これにより not found・空状態などの例外フローを決定的な初期状態から検証できる。
- 前提として `USE_IN_MEMORY_DB=true` はインターネット到達可能な環境で有効化しない（CI／ローカル専用）。既存の他サービス（niconico の `/api/test/*`、share-together の `/api/test/reset`）と同じ扱い。

##### リセットはサービス全体に及ぶ（並列実行との関係）

リセットはそのサービスの共有ストアを丸ごと空にする**グローバルな破壊的操作**であり、呼び出し元のテストだけに閉じない。Playwright は既定でファイル間も並列に実行するため、あるファイルのリセットが**別ファイルが用意したデータを消す**。

- リセットを使うファイルは、同一ファイル内の競合を防ぐために直列化する。ただし**これで防げるのはファイル内だけ**で、ファイル間の並列は防げない。
- ファイル間の安全性は、CI がワーカー 1 本で実行することに依存している。**ローカルで実行するときはワーカー数を 1 に固定する**こと。指定しないと、リセットを使わない他ファイルが巻き添えで落ちる。
- リセットを使うファイルは、実行順に依存して蓄積されたデータを前提にしないこと。必要なデータは自分で seed し、自分が seed したものだけを検証する。

##### 失敗を握り潰さない

テストデータのクリアや seed が失敗したら、**握り潰さず例外にする**こと。過去に「一覧取得の失敗を警告ログだけ出して継続する」実装があり、その結果**クリアが一度も成功していないままテストが green だった**ことがある。前提条件の破綻は、テスト本体の失敗より先に、はっきり落として気づけるようにする。

### テストデバイス

#### 標準構成

- **chromium-desktop**: Desktop Chrome（1920x1080）
- **chromium-mobile**: モバイルChrome（Pixel 5想定）
- **webkit-mobile**: モバイルSafari（iPhone想定）

#### スマホファーストの実践

モバイル環境を優先してテスト。デスクトップは補助的に確認。

### アクセシビリティテスト

#### 対象サービス

一般公開されるサービスでは実施を推奨。

#### ツール

- **axe-core**: 自動アクセシビリティチェック
- Playwrightと統合して実行

#### チェック項目

- WCAG 2.1 Level AA準拠
- キーボード操作
- スクリーンリーダー対応

## CI戦略

本セクションでは、テスト実行のためのCI/CD実装パターンを説明します。  
ブランチ戦略とCI/CDの全体像については、[ブランチ戦略](../branching.md) を参照してください。

### 2段階CI

#### ci-fast（高速フィードバック）

- **トリガー**: integration/** ブランチへのPR
- **対象**: chromium-mobile のみ
- **目的**: 開発中の素早いフィードバック

#### ci-full（完全テスト）

- **トリガー**: develop ブランチへのPR
- **対象**: 全3種デバイス
- **カバレッジチェック**: 80%未満で失敗

### CI最適化

- 並列実行数の調整
- 失敗時のスクリーンショット・動画記録
- リトライ設定（不安定なテストへの対処）

### GitHub Actions ワークフロー設計パターン

#### 推奨パターン: ターゲット別PR検証ワークフロー

サービスやライブラリごとに専用のPR検証ワークフローを作成することを推奨します。

**ファイル名**: `.github/workflows/{target}-verify.yml`  
（例: `hoge-verify.yml`）

#### 2段階CI戦略の適用

E2Eテストを持つサービスでは、1つのワークフローファイルで Fast/Full の両方を制御します:

**{target}-verify.yml**:
- トリガー: `integration/**` および `develop` ブランチへのPR
- E2Eテスト: 共通の E2E 再利用ワークフローを 1 ジョブで呼ぶ。デバイスは再利用ワークフローの中の matrix で並列実行する
    - `develop` へのPR では 3 デバイス、それ以外は chromium-mobile のみ (呼び出し側が `full: ${{ github.base_ref == 'develop' }}` を渡す)
    - サービスごとの違い (先にビルドする core、web のディレクトリ、レポートの置き場所、追加の環境変数) は入力で渡す
    - サービスごとに E2E のジョブを書かない。デバイス × サービスの数だけジョブをコピーすると、修正が一部のワークフローにしか入らなくなる
- カバレッジチェック: `develop` へのPR のみ実行（`if: github.base_ref == 'develop'`）
- 目的: 1ファイルで Fast（chromium-mobile のみ）と Full（全デバイス + カバレッジ）を制御

**ライブラリの場合**:
- E2Eテストがないため、単一の `{target}-verify.yml` のみ
- 中身は共通のライブラリ検証の再利用ワークフローで、`{target}-verify.yml` はトリガーとワークスペースを渡すだけの薄いファイルにする
- ライブラリごとにファイルを分けるのは、PR のチェックとコメントをライブラリごとに分けて見せるため
- トリガー: `develop` および `integration/**` ブランチへのPR

**トリガー設定のベストプラクティス**:

```yaml
on:
    pull_request:
        branches:
            - develop           # メインブランチ
            - integration/**    # 統合ブランチ
        paths:
            - 'libs/**'                   # ターゲットと依存ライブラリ
            - 'configs/**'                # 共有設定
            - '.github/actions/**'        # 共有 composite action
            - 'package.json'              # ルートパッケージ定義
            - 'package-lock.json'         # 依存関係ロック
            - '.github/workflows/hoge-verify.yml'  # ワークフロー自体
            - '.github/workflows/reusable-service-verify.yml' # 呼んでいる再利用ワークフロー
            - '.github/workflows/reusable-e2e.yml'
```

**設計原則**:

1. **ブランチフィルター**: `develop` と `integration/**` を標準とする
    - `develop`: プロダクションに向けた統合ブランチ
    - `integration/**`: フィーチャー統合用の作業ブランチ

2. **パスフィルター**: 関連ファイルのみでトリガー
    - **ターゲット**: 変更対象のディレクトリ（例: `services/hoge/**`）
    - **依存対象**: 依存ライブラリは個別に列挙せず `libs/**` とする。共通インフラ部品・共有設定も含める (理由と対象は [コーディング規約](./rules.md) の「Verify ワークフローは PR をトリガーとし、パスフィルターを設定」を参照)
    - **ルートパッケージ**: `package.json`, `package-lock.json`
    - **ワークフロー自体**: ワークフロー定義ファイルと、そこから呼ぶ再利用ワークフロー。再利用ワークフローを直したときに、呼び出し側の verify が走らないと検証から漏れる

3. **ワークスペース指定**: パッケージ名を使用
    ```yaml
    - name: Run tests
        run: npm run test --workspace=@nagiyu/hoge
    ```
    - パス指定（`services/hoge`）ではなくパッケージ名（`@nagiyu/hoge`）を使用
    - より明示的で、リファクタリング時にも対応しやすい

4. **ビルド順序の考慮**: 依存関係に従って順序を守る
    ```yaml
    - name: Build shared libraries
        run: npm run build:libs

    - name: Build application
        run: npm run build --workspace @nagiyu/hoge
    ```
    - **重要**: `npm run build` (全ワークスペース並列ビルド) を使用すると依存関係が考慮されず、ビルドエラーが発生する可能性があります
    - ライブラリ間の依存関係: `@nagiyu/ui` → `@nagiyu/browser` → `@nagiyu/common`
    - 詳細は [shared-libraries.md](./shared-libraries.md) の「ビルド順序」を参照

**検査の対象と、検査の決まり方**:

lint・format・ユニットテスト・カバレッジ・契約テストは、サービスごとに書かず、再利用ワークフロー (`reusable-service-verify.yml`) にまとめる。`{target}-verify.yml` は、対象のディレクトリ (`dirs`。例: `services/quick-clip infra/quick-clip`) を渡して呼ぶだけにする。

- **対象**: ルート `package.json` の `workspaces` を展開し、`dirs` 配下にあるワークスペースを検査する。ワークスペースを手で並べない
- **どの検査をかけるか**: 各ワークスペースの npm scripts の有無で決まる。スクリプトを持たない検査はかからず、どの検査も持たないワークスペースは対象から外れる

    | 検査 | npm script |
    |---|---|
    | lint | `lint` |
    | format | `format:check` |
    | ユニットテスト | `test` |
    | カバレッジ | `test:coverage` |
    | 契約テスト | `test:contract` |

- **なぜスクリプトの有無で決めるか**: 検査の対象をワークフローごとに手で並べていたため、並べ忘れたパッケージがユニットテストやカバレッジの検査から漏れていた (どこでも unit テストが走っていないパッケージがあった)。パッケージを足しても、ワークフローを書き換えずに検査がかかるようにする
- **カバレッジを外したいワークスペース**: 再利用ワークフローの `coverage-exclude` に名前を渡すと、`test:coverage` を持っていても `test` だけを流す。通常はスクリプト自体を置かないことで足りる

**新しいサービスやパッケージを足すとき**:

1. `{target}-verify.yml` を作り、`dirs` を渡して再利用ワークフローを呼ぶ。パッケージを同じディレクトリ配下に足すだけなら、ワークフローは変えない
2. 検査をかけたいものは、そのパッケージに npm scripts を用意する。用意しなければ、その検査はかからない。**漏れても CI は赤くならない**ため、新しいパッケージには `lint` / `format:check` / `test` / `test:coverage` を揃えるのを基本とする
3. ユニットテストの前に、web や batch が参照する `core` と、infra が参照する `@nagiyu/infra-common` はビルドされる。この前提から外れる構成 (別名の共有パッケージなど) では、ワークフロー側の変更が要る
4. ビルド・Docker・synth・E2E・サービス固有の検査 (portal の内部リンクチェック、niconico の batch の `test:integration` など) は、`{target}-verify.yml` 側にジョブとして残す。再利用ワークフローの対象外である

**検査の流し方**:

- **ワークスペースごとに 1 ジョブ (matrix)** で、lint → format → テストの順に流す。1 つが落ちても他のワークスペースの結果が見えるようにする
- **format はビルドより前に流す**。ビルドでできる `dist/` を prettier が拾って落ちるため
- **lint が落ちても format とテストは流す**。1 回の run で全部の結果を見えるようにし、直す往復を減らす
- **カバレッジは `develop` 向けの PR だけで検査する**。`develop` 向けは `test:coverage`、`integration/**` 向けは `test` を流す (Fast / Full の出し分けと同じ考え方)

**カバレッジチェックの動作**:

Jest の設定ファイル（`jest.config.ts`）で `coverageThreshold` を定義している場合、テストカバレッジが閾値を下回ると `npm run test:coverage` コマンドが非ゼロの終了コードで終了する。これによりジョブが自動的に失敗し、PR のマージを防ぐ。閾値は 80% とする。infra の各パッケージも同じ扱いで、`test:coverage` を持つ。

```typescript
// jest.config.ts
coverageThreshold: {
    global: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
    },
}
```

**例外（niconico-mylist-assistant/batch）**:

- `services/niconico-mylist-assistant/batch` のみ、`coverageThreshold` を設定していません
- 理由: コアロジックである `src/playwright-automation.ts` が Playwright (`chromium`, `Browser`, `Page`) に直接依存しています
- 技術的制約: ブラウザプロセス起動を伴う処理を Jest の単体テスト環境で再現しづらく、モック化が困難です
- これはバッチパッケージ全体の一般ルールではなく、当該パッケージ固有の構造的例外です（例: `services/stock-tracker/batch` など他のバッチパッケージは通常どおり 80% 閾値を設定します）
- 将来方針: Playwright 依存コードと純粋ロジックを分離し、テスタビリティを改善するタスクを別途検討します

**利点**:

- 無関係な変更でワークフローが実行されず、CIリソースを節約
- 変更対象に応じた適切なテストのみ実行され、高速なフィードバック
- ワークフロー定義が明確で、メンテナンスしやすい

#### ジョブ依存関係（needs）の設計

`needs` でジョブ間の依存を設定し、失敗した前提の後続を流さない。

- **ビルド成果物を使うジョブは、ビルドのジョブに `needs` を張る**: web / batch のビルドは core のビルドの後、Docker ビルドと E2E は web / batch のビルドの後に流す。ビルド順序が保証され、前提が壊れているときに後続が無駄に流れない
- **lint / format / テストは `needs` で縛らない**: 再利用ワークフローの中で、同じジョブ内の手順として流す。lint が落ちても後続を流して全部の結果を見せるため、ジョブを分けて止める設計にはしない
- **ビルド系ジョブどうしは並列にする**: 依存のないジョブは `needs` で直列にしない

この方針はサービスの構成 (core / web / batch など) に依らない。構成が異なるサービスでも、同じ原則でビルド成果物の依存だけに `needs` を張る。

**`report` ジョブと `if:` 条件の注意点**:

- `report` ジョブは共通の報告 action を呼ぶ。action は同じ run のジョブ一覧を Actions API で取って表を作るので、`needs` の結果を手で並べない。ジョブを足しても報告を直さずに済む
- `needs` には全ジョブを並べる。結果を渡すためではなく、全ジョブの終了を待つため
- `if: github.base_ref == 'develop'` でスキップされたジョブ (`skipped`) は、action が成功として扱う
- PR のターゲットブランチは、ジョブの `if:` では `github.base_ref` で参照する（`github.ref` ではない）。`actions/github-script` のスクリプトの中では `github` が API クライアントを指し `github.base_ref` は undefined になるため、`context.payload.pull_request.base.ref` を使う

## テスト作成ガイドライン

### ユニットテスト

#### 原則

- **純粋関数を優先**: 副作用のないテストしやすいコード
- **一つのテストで一つの検証**: テストケースを小さく保つ
- **AAA パターン**: Arrange（準備）、Act（実行）、Assert（検証）

#### 命名規則

```typescript
describe('機能名', () => {
  describe('関数名', () => {
    it('正常系: 説明', () => { /* ... */ });
    it('異常系: 説明', () => { /* ... */ });
    it('エッジケース: 説明', () => { /* ... */ });
  });
});
```

### E2Eテスト

#### 原則

- **ユーザー視点**: 実際の利用シナリオに沿って記述
- **安定性優先**: 不安定なテストは修正するか削除
- **独立性**: テスト間で状態を共有しない
- **決定的・1テスト1結末**: 実行時分岐で複数の結末を許容しない。UC の例外フローはロール／状態を固定した独立テストとして書く（詳細は「テスト戦略（層別の責務）」を参照）

#### テスト粒度

- 主要フローは細かくテスト
- 枝葉の機能は重要度に応じて判断
- 過度に細かいテストは避ける（メンテナンスコスト増）

## テストの実行

### ローカル環境

```bash
# ユニットテスト
npm test
npm run test:watch
npm run test:coverage

# E2Eテスト
npm run test:e2e
npm run test:e2e:ui       # UIモード（デバッグ用）
npm run test:e2e:headed   # ブラウザ表示モード
```

### CI環境

GitHub Actionsで自動実行。

## 既知の制約・技術的問題

### React 19 + Next.js 16 + Jest の互換性問題

#### 問題概要

React 19 の新しいアーキテクチャと Jest の組み合わせにおいて、Next.js App Router の page コンポーネントを直接ユニットテストすることができない互換性問題が確認されています。

**エラー内容**:
```
Invalid hook call. Hooks can only be called inside of the body of a function component.
TypeError: Cannot read properties of null (reading 'useState')
```

#### 影響範囲

- **影響あり**: Next.js App Router の page コンポーネント（`app/**/page.tsx`）
- **影響なし**: 
  - 個別の React コンポーネント（Material-UI コンポーネント含む）
  - Next.js API routes
  - ブラウザAPI以外のビジネスロジック

#### 検証結果

以下のテストパターンで動作確認済み:

| テスト対象 | 結果 | 備考 |
|-----------|------|------|
| Material-UI コンポーネント単体 | ✅ 動作 | ThemeProvider でラップして正常動作 |
| `useRouter` モック | ✅ 動作 | Next.js routing のモックは正常動作 |
| `useState` 等の React hooks | ❌ エラー | page コンポーネント内で使用時にエラー |
| Page コンポーネント全体 | ❌ エラー | App Router page は直接テスト不可 |
| API routes | ✅ 動作 | React 不使用のため影響なし |

#### 回避策

1. **E2E テストでカバー**（推奨）
   - Playwright による E2E テストで page の機能をテスト
   - 実際のユーザーフローを網羅的に検証
   - page コンポーネントはカバレッジ対象外に設定（`jest.config.ts` で除外）

2. **コンポーネント分割**
   - Page コンポーネントから小さな React コンポーネントを抽出
   - 抽出したコンポーネントを個別にユニットテスト
   - Page コンポーネント自体は最小限の構成とする

#### 将来の対応

React 19 の testing ecosystem が成熟し、以下のいずれかが対応された時点で再評価:
- Testing Library の React 19 完全対応
- Next.js の Jest 統合改善
- React Testing Tools の更新

### E2Eテストにおけるブラウザ固有の制約

#### 問題概要

Playwright E2E テストにおいて、ブラウザ/デバイスごとに Web API のサポート状況が異なるため、特定の環境でテストが失敗することがあります。

#### WebKit (Safari) モバイルでの Notification API

**問題**:
WebKit モバイル環境では `Notification` API が存在しないため、`Notification.permission` 等へのアクセスで `ReferenceError` が発生します。

```
Error: page.evaluate: ReferenceError: Can't find variable: Notification
```

**原因**:
iOS Safari では Web Push 通知が制限されており、`Notification` オブジェクト自体が定義されていません。

**回避策**:
API の存在確認を行い、サポートされていない環境ではテストをスキップします。

```typescript
test('通知許可がリクエストされる', async ({ page, context }) => {
  // Notification API がサポートされているか確認
  const hasNotificationApi = await page.evaluate(() => {
    return typeof Notification !== 'undefined';
  });

  // サポートされていない環境（webkit-mobile等）ではスキップ
  test.skip(!hasNotificationApi, 'Notification API is not supported in this environment');

  // 以降は通常のテストコード
  const permissionState = await page.evaluate(() => {
    return Notification.permission;
  });
  // ...
});
```

#### ブラウザ固有の制約一覧

| Web API | chromium-desktop | chromium-mobile | webkit-mobile | 備考 |
|---------|-----------------|-----------------|---------------|------|
| Notification | ✅ | ✅ | ❌ | iOS Safari は非サポート |
| Service Worker | ✅ | ✅ | ✅ | 登録は可能だが Push は制限あり |
| Web Push | ✅ | ✅ | ⚠️ | iOS 16.4+ で限定的にサポート |

#### 設計指針

1. **API存在確認を先に行う**: `typeof API !== 'undefined'` でチェック
2. **`test.skip()` で明示的にスキップ**: スキップ理由をメッセージで明記
3. **代替テストを検討**: 可能であれば別のアプローチでテストを追加

ここで許容されるのは「**ブラウザがその API を持たない**」という静的な条件によるスキップに限る。実行時の状態を見て自らスキップするものは「形骸化テストの禁止」に反する（→「E2E の定義」）。

#### Service Worker がリクエストのモックを無効化する

アプリが Service Worker を登録していると、**Chromium 以外ではリクエストのモックが効かなくなる**。Service Worker を経由したリクエストはテストツール側から捕捉できないためで、モックしたつもりの応答が素通りして実サービスへ疎通しようとしたり、Service Worker がキャッシュした古い応答が画面に出たりする。クライアントサイドの画面遷移が阻害されることもある。

症状が「モックが効かない」「取得したはずのデータが空になる」「遷移しない」と多様なうえ、Chromium では再現しないため原因に辿り着きにくい。**共通のヘッダー／フッターを提供するライブラリが Service Worker を登録している場合、それを使う全サービスが対象になる**点にも注意する。

対処は、テスト実行時に Service Worker を無効化すること。デバイス構成によって既定が揃っていない場合があるため、**モックや API 応答に依存するテストでは明示的に無効化する**のが確実。

#### hydration 完了前の入力はアプリに届かない

サーバー側で描画された直後の入力欄は、まだ JavaScript が結び付いていない素の HTML である。この状態で値を入力すると、**DOM の値だけが変わってアプリの状態は更新されない**。入力値に応じて有効化されるボタンが無効のままになり、「値は入っているのにボタンが押せない」という分かりにくい失敗になる。WebKit は Chromium より hydration が遅く、この症状が出やすい。

対処として、ページ遷移後・最初の操作前に読み込み完了を待つ。あわせて、入力してから「操作対象が有効になる」までを**冪等に再試行**して単一の結末へ収束させる書き方も有効である。これは結末を分岐させるものではなく、期待状態に達しなければタイムアウトで失敗するため「1 テスト = 1 結末」を損なわない。

#### 脆いロケーターは特定ブラウザでだけ壊れる

「ある文字列を含む要素の親をたどって、最初の入力欄を取る」といった位置関係に依存する指定は、同じ文字列が別の箇所（ボタンのラベルなど）にも現れると**掴む要素がブラウザや描画タイミングによって変わる**。プレースホルダーやアクセシビリティ上の名前など、要素を一意に識別できる属性で指定すること。無駄な待ち時間の削減にもつながる。

#### 検証はサービス全体で行う

**ファイル単体で green でも、サービス全体を通すと落ちることがある**。全体実行のほうが負荷が高く hydration が遅れやすいこと、直列化していないファイル間でデータが干渉することが理由。修正の確認は対象ファイル単体で素早く回してよいが、**完了判断は必ずサービス全体の実行で行う**。

## 内部リンクチェック（Portal）

Portal では Markdown コンテンツや JSX ページコンポーネント内の内部リンク切れを静的解析で検出するスクリプトを常設している。

### 実行方法

```bash
# Portal ディレクトリで実行
npm run check:internal-links --workspace @nagiyu/portal-web
# または services/portal/web 配下で直接実行
cd services/portal/web
npm run check:internal-links
```

### スクリプトの動作

`services/portal/web/scripts/check-internal-links.mjs` が以下を実施する:

1. `src/content/` 配下の全 Markdown / MDX ファイルを走査
2. `src/app/` 配下の全 TSX ファイルを走査
3. 各ファイルから静的な内部リンクを抽出（Markdown 形式・JSX `href` 属性）
4. 以下のルール対応で実在確認:
   - `/tech/{slug}` → `src/content/tech/{slug}.md`
   - `/tech/tags/{tagSlug}` → タグ付き記事 1 件以上
   - `/tech/category/{slug}` → `src/content/tech-category/{slug}.md` + 該当記事 1 件以上
   - `/services/{slug}` → `src/content/services/{slug}/index.md`
   - `/services/{slug}/{doc}` → `src/content/services/{slug}/{doc}.md`
   - 静的ページ（`/`, `/about`, `/privacy`, `/terms` 等）→ `src/app/.../page.tsx`
5. リンク切れがあれば終了コード 1 で一覧を出力、なければ 0 で終了

### ビジネスロジックとテスト

チェックロジックは `src/lib/linkChecker.ts` に切り出してあり、`tests/unit/lib/linkChecker.test.ts` で単体テストを実施（カバレッジ 99%+）。

### CI 組み込み

スクリプトの実行時間は 30 秒以内（実測 < 100ms）のため、`portal-verify.yml` の `unit-test` ジョブの後続ジョブとして `check-internal-links` ステップを追加している。integration ブランチへの PR 時にも実行される。

### 注意事項

- **外部リンク（https://）は対象外**（メンテコスト回避）
- **動的テンプレートリテラル**（`href={\`/tech/${slug}\`}` 等）は解析対象外（実行時生成のため）
- 新しいルーティングパターンを追加した場合は `src/lib/linkChecker.ts` の `validateHref` 関数を更新すること

## 参考

- [rules.md](./rules.md): コーディング規約・べからず集
- [service-template.md](./service-template.md): サービステンプレート
- [architecture.md](./architecture.md): アーキテクチャ方針
- [configs.md](./configs.md): 共通設定ファイル
