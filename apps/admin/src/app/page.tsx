import { redirect } from 'next/navigation';

import { getDashboardActor } from '@/lib/session';

/** Entry point: straight to the queue, or to sign-in. There is no landing page. */
export default async function RootPage() {
  redirect((await getDashboardActor()) === null ? '/login' : '/reports');
}
