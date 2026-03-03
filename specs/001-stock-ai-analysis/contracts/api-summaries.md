# GET /api/summaries レスポンス契約（更新版）

**バージョン**: 2.0.0（`aiAnalysis` フィールド追加）  
**変更日**: 2026-03-03  
**後方互換性**: あり（フィールド追加のみ、既存フィールド変更なし）

---

## エンドポイント

```
GET /api/summaries?date={YYYY-MM-DD}
```

### 認証

`stocks:read` スコープが必要（NextAuth セッション経由）

### クエリパラメータ

| パラメータ | 型 | 必須 | 説明 |
|-----------|---|------|------|
| `date` | string | 任意 | YYYY-MM-DD 形式。省略時は最新日付 |

---

## レスポンス

### 200 OK

```json
{
  "exchanges": [
    {
      "exchangeId": "string",
      "exchangeName": "string",
      "date": "string | null",
      "summaries": [
        {
          "tickerId": "string",
          "symbol": "string",
          "name": "string",
          "open": "number",
          "high": "number",
          "low": "number",
          "close": "number",
          "updatedAt": "string (ISO 8601 UTC)",
          "buyPatternCount": "number",
          "sellPatternCount": "number",
          "patternDetails": [
            {
              "patternId": "string",
              "name": "string",
              "description": "string",
              "signalType": "BUY | SELL",
              "status": "MATCHED | NOT_MATCHED | INSUFFICIENT_DATA"
            }
          ],
          "aiAnalysis": "string | null | undefined"
        }
      ]
    }
  ]
}
```

### フィールド詳細

#### `summaries[].aiAnalysis`

| 項目 | 値 |
|------|---|
| 型 | `string`、`null`、または `undefined` |
| `string` の意味 | バッチ処理で AI 解析が正常に生成された |
| `null` の意味 | AI 解析の生成が失敗した（UI: 「AI 解析の取得に失敗しました」と表示） |
| `undefined` の意味 | AI 解析が未生成（バッチ未実行等）（UI: 「AI 解析はまだ生成されていません」と表示） |
| 言語 | 日本語 |
| 内容 | 価格動向の解釈、パターン分析の説明、関連市場情報を含む解析テキスト |
| 最大文字数 | 約 2,000 文字（OpenAI レスポンス依存） |

### 400 Bad Request

```json
{
  "error": "INVALID_DATE",
  "message": "日付はYYYY-MM-DD形式で指定してください"
}
```

### 401 Unauthorized

NextAuth セッションなし（既存の `withAuth` ミドルウェアが処理）

### 500 Internal Server Error

```json
{
  "error": "INTERNAL_ERROR",
  "message": "サマリーの取得に失敗しました"
}
```

---

## 変更履歴

| バージョン | 変更内容 |
|-----------|---------|
| 2.0.0 | `summaries[].aiAnalysis` フィールドを追加（optional） |
| 1.0.0 | 初版（既存実装） |
