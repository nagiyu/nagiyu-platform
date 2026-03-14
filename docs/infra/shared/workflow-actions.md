# ワークフロー Composite Actions

各サービスの GitHub Actions ワークフローで共通利用される composite actions の設計方針と仕様です。

## 設計原則

### verify と deploy のビルド一致

verify ワークフローは「deploy と全く同じ条件でビルドが成功すること」を保証します。
そのため、verify と deploy は同一の composite action を通じてビルドを実行し、
アプリバージョン等のビルド引数も deploy と同じ方法で取得・渡します。

これにより、verify を通過したビルドが deploy でも同じ結果になることが保証されます。

### deploy 固有処理の位置づけ

ECR へのイメージプッシュや Lambda 更新などの deploy 固有処理は composite action の外に置きます。
composite action はビルドのみを担当し、その結果を呼び出し元が利用します。

## Composite Actions

### Docker イメージビルド

Docker イメージのビルドのみを担当します。プッシュは含みません。

- verify では呼び出し元でローカルタグを指定してビルド成功を確認します
- deploy では同じ action でビルドした後、呼び出し元で ECR へのプッシュを実施します
- 内部で Docker ビルドロックの取得・解放を行います（詳細は [Docker ビルド排他制御](./docker-build-lock.md) を参照）

### Web アプリビルド（Node.js）

Next.js 等の Web アプリケーションのビルドを担当します。

- 依存する共有ライブラリが存在する場合は、事前にそれらもビルドします
- verify / deploy の両方から呼び出されます

### Node.js セットアップ

Node.js のセットアップと依存関係のインストールを担当します。

- Node.js バージョンの指定とパッケージのインストールを一括して行います
- ワークフロー冒頭のセットアップ手順をサービス横断で統一します

### 環境判定

ブランチ名や入力値をもとに dev / prod 環境を判定します。

- 判定結果を後続ステップが参照できる形で出力します
- deploy 系ワークフローで共通利用されます
