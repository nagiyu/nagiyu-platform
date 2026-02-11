#!/usr/bin/env node
/**
 * VAPID キー生成スクリプト
 *
 * Web Push 通知に必要な VAPID (Voluntary Application Server Identification) キーペアを生成します。
 * 生成されたキーは環境変数として設定する必要があります。
 *
 * 使用方法:
 *   node scripts/generate-vapid-keys.js
 *
 * 出力:
 *   VAPID_PUBLIC_KEY=<公開鍵>
 *   VAPID_PRIVATE_KEY=<秘密鍵>
 */

const webpush = require('web-push');

// VAPID キーペアを生成
const vapidKeys = webpush.generateVAPIDKeys();

console.log('=== VAPID キーが生成されました ===');
console.log('');
console.log('以下の環境変数を設定してください:');
console.log('');
console.log(`VAPID_PUBLIC_KEY=${vapidKeys.publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${vapidKeys.privateKey}`);
console.log('');
console.log('注意:');
console.log('- 秘密鍵は厳重に管理してください');
console.log('- 本番環境と開発環境で異なるキーを使用してください');
console.log('- キーは AWS Systems Manager Parameter Store や Secrets Manager に保存することを推奨します');
console.log('');
