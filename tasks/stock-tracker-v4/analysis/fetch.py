"""dev テーブルの DailySummary を取得し、../data/ds.parquet に変換する（読み取りのみ）。

事前に AWS CLI で dev テーブルを scan して JSON を保存しておく:

    aws dynamodb scan --table-name nagiyu-stock-tracker-main-dev --region us-east-1 \
      --filter-expression "#t = :t" --expression-attribute-names '{"#t":"Type"}' \
      --expression-attribute-values '{":t":{"S":"DailySummary"}}' --output json > ../data/ds.json
"""
import json
import os

import pandas as pd

HERE = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(HERE, '..', 'data')

items = json.load(open(os.path.join(DATA_DIR, 'ds.json')))['Items']
rows = []
for i in items:
    r = {'ticker': i['TickerID']['S'], 'ex': i['ExchangeID']['S'], 'date': i['Date']['S'],
         'created': int(i['CreatedAt']['N'])}
    for k in ['Open', 'High', 'Low', 'Close', 'Volume']:
        r[k.lower()] = float(i[k]['N']) if k in i else None
    for p, v in i['PatternResults']['M'].items():
        r['p:' + p] = v['S']
    rows.append(r)
pd.DataFrame(rows).to_parquet(os.path.join(DATA_DIR, 'ds.parquet'))
