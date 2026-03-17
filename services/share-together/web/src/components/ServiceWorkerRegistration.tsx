'use client';

import {
  SERVICE_WORKER_REGISTRATION_ERROR_MESSAGES,
  ServiceWorkerRegistration as SharedServiceWorkerRegistration,
} from '@nagiyu/ui';

export const ERROR_MESSAGES = SERVICE_WORKER_REGISTRATION_ERROR_MESSAGES;

export default function ServiceWorkerRegistration() {
  return <SharedServiceWorkerRegistration />;
}
