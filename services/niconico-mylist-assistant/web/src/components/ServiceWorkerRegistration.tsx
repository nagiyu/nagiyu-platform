'use client';

import { ServiceWorkerRegistration as SharedServiceWorkerRegistration } from '@nagiyu/ui';

export default function ServiceWorkerRegistration() {
  return <SharedServiceWorkerRegistration subscribeEndpoint="/api/push/subscribe" />;
}
