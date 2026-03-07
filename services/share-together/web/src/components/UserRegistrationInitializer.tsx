'use client';

import { useEffect } from 'react';

const REGISTRATION_COMPLETED_KEY = 'share-together:user-registration-completed';
const ERROR_MESSAGES = {
  USER_REGISTRATION_AUTO_CALL_FAILED: 'ユーザー登録 API の自動実行に失敗しました',
} as const;

export default function UserRegistrationInitializer() {
  useEffect(() => {
    if (window.sessionStorage.getItem(REGISTRATION_COMPLETED_KEY) === 'true') {
      return;
    }

    void globalThis
      .fetch('/api/users', { method: 'POST' })
      .then((response) => {
        if (!response.ok) {
          throw new Error(`status: ${response.status}`);
        }
        window.sessionStorage.setItem(REGISTRATION_COMPLETED_KEY, 'true');
      })
      .catch((error: unknown) => {
        console.error(ERROR_MESSAGES.USER_REGISTRATION_AUTO_CALL_FAILED, { error });
      });
  }, []);

  return null;
}
