---
sources:
  - libs/aws/src/crypto/encryption.ts
  - libs/aws/src/crypto/types.ts
sources_hash: b6c5aac6900406c7aa8a4449c7effdd775406144fc28a9964de62d6d5aa92325
---

# 暗号化

AWS Secrets Manager に置いた鍵で、文字列を AES-256-GCM により暗号化・復号する。`@nagiyu/aws` から import する。

## 使い方

| 関数 | 引数 | 戻り値 |
|---|---|---|
| `encrypt` | `plaintext`、`config` | `EncryptedData` |
| `decrypt` | `encryptedData`、`config` | 復号した文字列 |
| `getEncryptionKey` | `config` | 鍵 (32 バイトの `Buffer`) |
| `clearCache` | なし | 鍵と Secrets Manager クライアントのキャッシュを消す (テスト用) |

| 型 | 項目 | 内容 |
|---|---|---|
| `CryptoConfig` | `secretName` | Secrets Manager のシークレット名 |
| | `region` (省略可) | 既定は `ap-northeast-1` |
| `EncryptedData` | `ciphertext`、`iv`、`authTag` | いずれも Base64 の文字列 |

```ts
const config = { secretName: 'my-encryption-key' };
const encrypted = await encrypt('password123', config);
const plaintext = await decrypt(encrypted, config);
```

## 振る舞い

### 暗号化

| 項目 | 値 |
|---|---|
| アルゴリズム | AES-256-GCM |
| IV | 12 バイト。暗号化のたびにランダムに作る |
| 認証タグ | 16 バイト |

### 鍵

- シークレットの文字列 (`SecretString`) を UTF-8 のバイト列にして、先頭の 32 バイトを鍵にする。32 バイトに満たなければ失敗する
- 鍵は、プロセスに 1 つだけキャッシュする。`config` の `secretName` と `region` は、キャッシュ済みなら見ない。別の `secretName` を渡しても、最初に取得した鍵を返す
- Secrets Manager のクライアントも、プロセスに 1 つだけ作る (最初に渡した `region` を使う)

### 失敗したとき

| 状況 | 結果 |
|---|---|
| `plaintext` が空 | `暗号化する文字列が空です` |
| 暗号文、IV、認証タグのどれかが空 | それぞれ `復号化する文字列が空です`、`初期化ベクトルが指定されていません`、`認証タグが指定されていません` |
| `secretName` が空 (鍵が未キャッシュのとき) | `シークレット名が指定されていません` |
| シークレットを取得できない、`SecretString` が空、32 バイト未満 | `getEncryptionKey` は `Secrets Manager からシークレットを取得できませんでした: {原因}` の `Error`。`encrypt` と `decrypt` では、さらに `暗号化処理に失敗しました: `、`復号化処理に失敗しました: ` が前に付く |
| 認証タグの検証に失敗 (データの改ざん、鍵の違い) | `認証タグの検証に失敗しました（データが改ざんされている可能性があります）` |
| 上のどれでもない失敗 | `暗号化処理に失敗しました: {原因}` または `復号化処理に失敗しました: {原因}` |

- どれも `Error` で、原因があれば `cause` に持つ
- 入力の検査 (空の文字列) は、鍵を取得する前に行う

## 理由

- AES-256-GCM は、暗号化と同時に改ざんを検出するため。認証タグの検証に失敗したときは、改ざんの可能性を示す専用のメッセージにする
- 鍵はキャッシュする。暗号化と復号のたびに Secrets Manager を呼ばないため。キャッシュの単位がプロセスで 1 つなので、1 つのプロセスでは 1 つのシークレットだけを使う
