import { Bell, Check, CheckCheck, ChevronRight, Database, ScanLine, ShieldAlert, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import type { NotificationEvent, NotificationTone } from "./notification-model";

type NotificationItem = { id: string; title: string; message: string; tone: NotificationTone; timestamp: number; href?: string; read?: boolean };

const seed: NotificationItem[] = [
  { id: "pipeline-ready", title: "Inference pipeline ready", message: "YOLO26n checkpoint is available for a new inspection.", tone: "success", timestamp: Date.now() - 1000 * 60 * 4, href: "/inspection" },
  { id: "database-connected", title: "Supabase connected", message: "Inspection history and analytics are reading from live project data.", tone: "info", timestamp: Date.now() - 1000 * 60 * 12, href: "/history" },
  { id: "metrics-pending", title: "Evaluation metrics pending", message: "Add a held-out report before showing precision, recall, or mAP.", tone: "warning", timestamp: Date.now() - 1000 * 60 * 38, href: "/model" },
];

const toneStyles: Record<NotificationTone, { icon: typeof Check; iconClass: string; dot: string }> = {
  success: { icon: Check, iconClass: "bg-[#FFF3C4] text-[#0B0909]", dot: "bg-[#F2B941]" },
  info: { icon: Database, iconClass: "bg-[#E8F7F3] text-[#087e6d]", dot: "bg-[#087e6d]" },
  warning: { icon: ShieldAlert, iconClass: "bg-[#FFF3C4] text-[#8a5a00]", dot: "bg-[#8a5a00]" },
};

function relativeTime(timestamp: number) {
  const minutes = Math.max(1, Math.round((Date.now() - timestamp) / 60000));
  return minutes < 60 ? `${minutes}m ago` : `${Math.round(minutes / 60)}h ago`;
}

export default function NotificationCenter() {
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(seed);
  const unread = useMemo(() => items.filter(item => !item.read).length, [items]);

  useEffect(() => {
    const onNotification = (event: Event) => {
      const detail = (event as CustomEvent<NotificationEvent>).detail;
      if (!detail?.title || !detail?.message) return;
      setItems(current => [{ ...detail, id: detail.id || `notification-${Date.now()}`, timestamp: Date.now(), read: false }, ...current].slice(0, 12));
    };
    window.addEventListener("solarvision:notification", onNotification);
    return () => window.removeEventListener("solarvision:notification", onNotification);
  }, []);

  const markAllRead = () => setItems(current => current.map(item => ({ ...item, read: true })));
  const clearAll = () => setItems([]);
  const openItem = (item: NotificationItem) => {
    setItems(current => current.map(currentItem => currentItem.id === item.id ? { ...currentItem, read: true } : currentItem));
    setOpen(false);
    if (item.href) setLocation(item.href);
  };

  return <div className="relative">
    <button onClick={() => setOpen(value => !value)} aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`} aria-expanded={open} className="relative grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-all hover:-translate-y-0.5 hover:border-[#F2B941] hover:text-[#0B0909] active:scale-95">
      <Bell className="h-[17px] w-[17px]" />
      {unread > 0 && <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-[#0B0909] px-1 text-[10px] font-bold text-[#F2B941] ring-2 ring-[#EBE8D2]">{unread > 9 ? "9+" : unread}</span>}
    </button>
    {open && <>
      <button className="fixed inset-0 z-40 cursor-default" aria-label="Close notifications" onClick={() => setOpen(false)} />
      <section className="absolute right-0 top-12 z-50 w-[min(380px,calc(100vw-32px))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_20px_60px_rgba(11,9,9,0.18)]" aria-label="Notification center">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4"><div><p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#F2B941]">Operations inbox</p><h2 className="mt-1 text-base font-semibold text-[#0B0909]">Notifications</h2></div><div className="flex items-center gap-1"><button onClick={markAllRead} className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-[#FFF3C4] hover:text-[#0B0909]" aria-label="Mark all notifications as read" title="Mark all as read"><CheckCheck className="h-4 w-4" /></button><button onClick={() => setOpen(false)} className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-[#0B0909]" aria-label="Close notifications"><X className="h-4 w-4" /></button></div></div>
        <div className="max-h-[380px] overflow-y-auto p-2">{items.length === 0 ? <div className="px-5 py-10 text-center"><Bell className="mx-auto h-6 w-6 text-slate-300" /><p className="mt-3 text-sm font-medium text-slate-600">All clear</p><p className="mt-1 text-xs text-slate-400">New inspection and runtime updates will appear here.</p></div> : items.map(item => { const style = toneStyles[item.tone]; const Icon = item.tone === "success" ? ScanLine : style.icon; return <button key={item.id} onClick={() => openItem(item)} className={`group flex w-full gap-3 rounded-xl p-3 text-left transition-colors hover:bg-[#F4F0D7] ${item.read ? "opacity-65" : ""}`}><span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${style.iconClass}`}><Icon className="h-4 w-4" /></span><span className="min-w-0 flex-1"><span className="flex items-start justify-between gap-2"><span className="text-xs font-semibold text-[#0B0909]">{item.title}</span>{!item.read && <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`} />}</span><span className="mt-1 block text-[11px] leading-5 text-slate-500">{item.message}</span><span className="mt-1 block font-mono text-[10px] text-slate-400">{relativeTime(item.timestamp)}</span></span><ChevronRight className="mt-2 h-4 w-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5" /></button>; })}</div>
        {items.length > 0 && <div className="border-t border-slate-100 px-4 py-3"><button onClick={clearAll} className="text-[11px] font-semibold text-slate-400 transition-colors hover:text-[#0B0909]">Clear notification history</button></div>}
      </section>
    </>}
  </div>;
}
