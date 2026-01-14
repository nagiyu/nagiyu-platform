#!/usr/bin/env python3
"""
週次npm管理レポート Issue の本文を生成するスクリプト

環境変数:
  OUTDATED - npm outdated のチェック結果
  AUDIT - npm audit のチェック結果
  DUPLICATES - 重複パッケージのチェック結果
  INCONSISTENCY - バージョン不整合のチェック結果
  NEXT_DATE - 次回チェック予定日
  CREATE_TIME - 作成日時
"""

import os
import sys
from datetime import datetime


def main():
    # 環境変数から値を取得
    audit = os.environ.get('AUDIT', '')
    outdated = os.environ.get('OUTDATED', '')
    duplicates = os.environ.get('DUPLICATES', '')
    inconsistency = os.environ.get('INCONSISTENCY', '')
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
