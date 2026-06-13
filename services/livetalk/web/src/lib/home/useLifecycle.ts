'use client';

import { type Dispatch, type SetStateAction, useEffect, useState } from 'react';
import type { LifecycleState } from '@nagiyu/livetalk-core';

/**
 * useLifecycle の戻り値型。
 */
export interface UseLifecycleResult {
  /** 現在のライフサイクル状態 */
  lifecycleState: LifecycleState;
  /**
   * ライフサイクル状態を更新する関数。
   * handleSubmit のストリームイベント処理（lifecycle イベント受信時）で使う。
   */
  setLifecycleState: Dispatch<SetStateAction<LifecycleState>>;
}

/**
 * キャラクターの生活サイクル状態を管理するカスタム hook。
 *
 * 起動時・キャラ切替時に /api/lifecycle を取得し、Live2D に反映する。
 * 失敗時は現状維持（'awake'）。演出のための取得なので UI は止めない。
 */
export function useLifecycle(characterId: string): UseLifecycleResult {
  const [lifecycleState, setLifecycleState] = useState<LifecycleState>('awake');

  // 起動時・キャラ切替時に生活サイクル状態を取得し、初回発話を待たずに Live2D へ反映する。
  // 失敗時は現状維持（'awake'）。演出のための取得なので UI は止めない。
  useEffect(() => {
    fetch(`/api/lifecycle?characterId=${encodeURIComponent(characterId)}`)
      .then((res) => res.json())
      .then((data: { state: LifecycleState }) => {
        if (data.state === 'awake' || data.state === 'sleeping') {
          setLifecycleState(data.state);
        }
      })
      .catch(() => {
        // 取得失敗時は初期値 'awake' のまま
      });
  }, [characterId]);

  return { lifecycleState, setLifecycleState };
}
