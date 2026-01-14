#!/usr/bin/env python3
"""
週次npm管理レポート Issue の本文を生成するスクリプト

環境変数:
  OUTDATED - npm outdated のチェック結果（Base64エンコード済み）
  AUDIT - npm audit のチェック結果（Base64エンコード済み）
  DUPLICATES - 重複パッケージのチェック結果（Base64エンコード済み）
  INCONSISTENCY - バージョン不整合のチェック結果（Base64エンコード済み）
  NEXT_DATE - 次回チェック予定日
  CREATE_TIME - 作成日時
"""

import os
import sys
import base64
from datetime import datetime


def main():
    # 環境変数から値を取得してBase64デコード
    audit_encoded = os.environ.get('AUDIT', '')
    outdated_encoded = os.environ.get('OUTDATED', '')
    duplicates_encoded = os.environ.get('DUPLICATES', '')
    inconsistency_encoded = os.environ.get('INCONSISTENCY', '')

    # Base64デコード
    try:
        audit = base64.b64decode(audit_encoded).decode('utf-8') if audit_encoded else ''
        outdated = base64.b64decode(outdated_encoded).decode('utf-8') if outdated_encoded else ''
        duplicates = base64.b64decode(duplicates_encoded).decode('utf-8') if duplicates_encoded else ''
        inconsistency = base64.b64decode(inconsistency_encoded).decode('utf-8') if inconsistency_encoded else ''
    except Exception as e:
        print(f"Error decoding Base64: {e}", file=sys.stderr)
        sys.exit(1)

    next_date = os.environ.get('NEXT_DATE', '未定')
    create_time = os.environ.get('CREATE_TIME', datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC'))

    # テンプレートを読み込み
    template_path = '.github/workflows/templates/weekly-npm-body.md'
    try:
        with open(template_path, 'r', encoding='utf-8') as f:
            template = f.read()
    except FileNotFoundError:
        print(f"Error: Template file not found: {template_path}", file=sys.stderr)
        sys.exit(1)

    # プレースホルダーを置換
    result = template.replace('{{AUDIT}}', audit)
    result = result.replace('{{OUTDATED}}', outdated)
    result = result.replace('{{DUPLICATES}}', duplicates)
    result = result.replace('{{INCONSISTENCY}}', inconsistency)
    result = result.replace('{{NEXT_DATE}}', next_date)
    result = result.replace('{{CREATE_TIME}}', create_time)

    # 出力（末尾の改行なし）
    print(result, end='')


if __name__ == '__main__':
    main()
