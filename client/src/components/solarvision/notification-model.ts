export type NotificationTone = "success" | "info" | "warning";

export type NotificationEvent = {
  id?: string;
  title: string;
  message: string;
  tone: NotificationTone;
  href?: string;
};

export function createInspectionNotification(filename: string, detections: number, failedMessage?: string): NotificationEvent {
  if (failedMessage) return { title: "Inspection failed", message: failedMessage, tone: "warning", href: "/inspection" };
  return { title: "Inspection completed", message: `${filename} returned ${detections} defect${detections === 1 ? "" : "s"}. Review the annotated evidence.`, tone: detections > 0 ? "warning" : "success", href: "/inspection" };
}
