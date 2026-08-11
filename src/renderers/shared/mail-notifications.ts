import type { MailNotification } from "../../shared/integration-types.js";

interface MailNotificationBridge {
  dismissMailNotification(notificationId: string): Promise<void>;
  getMailNotifications(): Promise<MailNotification[]>;
  onMailNotificationsChanged(
    listener: (notifications: MailNotification[]) => void,
  ): () => void;
  openMailNotification(notificationId: string): Promise<void>;
}

const DISPLAY_MS = 8_000;

export async function initializeMailNotifications(
  container: HTMLElement,
  bridge: MailNotificationBridge,
): Promise<void> {
  const bubble = document.createElement("aside");
  bubble.className = "mail-speech-bubble";
  bubble.hidden = true;
  bubble.setAttribute("aria-live", "polite");

  const message = document.createElement("button");
  message.className = "mail-speech-message";
  message.type = "button";
  message.title = "Open Gmail";

  const close = document.createElement("button");
  close.className = "mail-speech-close";
  close.type = "button";
  close.setAttribute("aria-label", "Dismiss mail notification");
  close.textContent = "×";

  bubble.append(message, close);
  container.append(bubble);

  let active: MailNotification | null = null;
  let timeout: ReturnType<typeof setTimeout> | null = null;

  const clearDismissTimer = () => {
    if (timeout !== null) clearTimeout(timeout);
    timeout = null;
  };

  const dismiss = async () => {
    if (active === null) return;
    const notificationId = active.notificationId;
    active = null;
    bubble.hidden = true;
    clearDismissTimer();
    await bridge.dismissMailNotification(notificationId);
  };

  const render = (notifications: MailNotification[]) => {
    const next = notifications[0] ?? null;
    if (next?.notificationId === active?.notificationId) return;
    clearDismissTimer();
    active = next;
    bubble.hidden = next === null;
    message.textContent = next?.text ?? "";
    if (next !== null) {
      timeout = setTimeout(() => {
        void dismiss().catch((error: unknown) => {
          console.error("Unable to dismiss mail notification.", error);
        });
      }, DISPLAY_MS);
    }
  };

  close.addEventListener("click", (event) => {
    event.stopPropagation();
    void dismiss().catch((error: unknown) => {
      console.error("Unable to dismiss mail notification.", error);
    });
  });
  message.addEventListener("click", () => {
    if (active === null) return;
    const notificationId = active.notificationId;
    active = null;
    bubble.hidden = true;
    clearDismissTimer();
    void bridge.openMailNotification(notificationId).catch((error: unknown) => {
      console.error("Unable to open Gmail notification.", error);
    });
  });

  const unsubscribe = bridge.onMailNotificationsChanged(render);
  window.addEventListener("unload", () => {
    clearDismissTimer();
    unsubscribe();
  }, { once: true });
  render(await bridge.getMailNotifications());
}
