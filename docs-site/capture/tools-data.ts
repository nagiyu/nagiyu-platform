/**
 * tools の撮影に使うデータ。
 * 入力は E2E と同じ形式のサンプルで、鍵は実在しない使い捨ての値にして、撮るたびに同じ画像になるようにする。
 */

/** 初回訪問ダイアログの表示可否を決める localStorage のキー。サービス側の定義と同じ値 */
export const MIGRATION_DIALOG_STORAGE_KEY = 'tools-migration-dialog-shown';

/** 乗り換え案内の共有テキスト (乗換案内アプリの共有形式) */
export const TRANSIT_TEXT = `東京 ⇒ 横浜
2026年2月28日(土)
10:00 ⇒ 10:45
------------------------------
所要時間 45分
運賃[IC優先] 500円
乗換 1回
距離 30.5 km
------------------------------

■東京
↓ 10:00〜10:20
↓ JR東海道線 熱海行
↓ 1番線発 → 2番線着
■品川
↓ 10:25〜10:45
↓ JR京浜東北線 横浜方面
↓ 3番線発 → 4番線着
■横浜`;

/** 「⇒」を含まない、乗り換え案内でないテキスト */
export const NOT_TRANSIT_TEXT = `これは乗り換え案内ではありません
ただのテキストです`;

/** 整形前の JSON (1 行) */
export const JSON_COMPACT =
  '{"user":{"name":"Alice","profile":{"age":25,"country":"Japan"}},"items":[{"id":1,"value":"test"}]}';

/** 引用符のない、JSON として正しくない文字列 */
export const JSON_INVALID = '{name:"Alice",}';

/** エンコード・ハッシュの入力に使う文字列 */
export const SAMPLE_TEXT = 'こんにちは、世界!';

/** Base64 としても URL エンコードとしても正しくない文字列 */
export const NOT_ENCODED_TEXT = 'これは変換済みの文字列ではありません%';

/** 偽の VAPID キー。形式 (Base64url の長さ) だけを似せた、実在しない値 */
export const FAKE_VAPID_KEYS = {
  publicKey:
    'BAMPLE-capture-0000000000000000000000000000000000000000000000000000000000000000000000-PUBLIC',
  privateKey: 'SAMPLE-capture-0000000000000000000000000000-PRIVATE',
};
