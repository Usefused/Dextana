import { Notification } from 'electron';
import type { AppNotification } from '../shared/notifications';

/** OS alerts are supplementary; all events are already saved in the app inbox. */
export function showNativeNotification(item: AppNotification, open: () => void) {
  if (!Notification.isSupported()) return;
  const alert = new Notification({ title: item.title, body: item.body, silent: false });
  alert.on('click', open);
  alert.on('failed', () => {
    /* OS permission or delivery failures do not lose the inbox entry. */
  });
  alert.show();
}
