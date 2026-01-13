/**
 * Web Notification API wrapper for PWA notifications
 */

export type NotificationPermission = "granted" | "denied" | "default";

/**
 * Check if notifications are supported
 */
export function isNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/**
 * Get current notification permission
 */
export function getNotificationPermission(): NotificationPermission {
  if (!isNotificationSupported()) return "denied";
  return Notification.permission as NotificationPermission;
}

/**
 * Request notification permission
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
  if (!isNotificationSupported()) return "denied";

  try {
    const permission = await Notification.requestPermission();
    return permission as NotificationPermission;
  } catch (error) {
    console.error("[Notification] Permission request failed:", error);
    return "denied";
  }
}

/**
 * Show a notification
 */
export function showNotification(
  title: string,
  options?: {
    body?: string;
    icon?: string;
    tag?: string;
    requireInteraction?: boolean;
  }
): Notification | null {
  if (!isNotificationSupported()) {
    console.warn("[Notification] Notifications not supported");
    return null;
  }

  if (Notification.permission !== "granted") {
    console.warn("[Notification] Permission not granted");
    return null;
  }

  try {
    const notification = new Notification(title, {
      body: options?.body,
      icon: options?.icon || "/icon-192.png",
      tag: options?.tag,
      requireInteraction: options?.requireInteraction ?? false,
    });

    return notification;
  } catch (error) {
    console.error("[Notification] Failed to show notification:", error);
    return null;
  }
}

/**
 * Show task completion notification
 */
export function notifyTaskComplete(taskDescription?: string): Notification | null {
  return showNotification("タスク完了", {
    body: taskDescription || "Claude のタスクが完了しました",
    tag: "task-complete",
  });
}

/**
 * Show permission request notification
 */
export function notifyPermissionRequest(toolName: string): Notification | null {
  return showNotification("権限リクエスト", {
    body: `${toolName} の実行許可が必要です`,
    tag: "permission-request",
    requireInteraction: true,
  });
}

/**
 * Show error notification
 */
export function notifyError(message: string): Notification | null {
  return showNotification("エラー", {
    body: message,
    tag: "error",
  });
}

/**
 * Show reconnection notification
 */
export function notifyReconnected(): Notification | null {
  return showNotification("再接続完了", {
    body: "サーバーに再接続しました",
    tag: "reconnected",
  });
}
