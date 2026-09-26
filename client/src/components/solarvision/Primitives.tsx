import { cn } from "@/lib/utils";
import { ArrowUpRight, Database, Info } from "lucide-react";

export function PageIntro({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: React.ReactNode }) {
  return <div className="mb-7 flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="mb-2 text-[11px] font-bold uppercase tracking-[0.22em] text-[#F2B941]">{eyebrow}</p><h1 className="text-3xl font-semibold tracking-[-0.04em] text-[#0B0909] sm:text-[38px]">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-slate-500">{description}</p></div>{action}</div>;
}

export function StatusBadge({ tone = "neutral", children }: { tone?: "success" | "warning" | "neutral" | "danger"; children: React.ReactNode }) {
  const styles = { success: "bg-[#e6faf5] text-[#087e6d]", warning: "bg-[#FFF3C4] text-[#0B0909]", neutral: "bg-slate-100 text-slate-600", danger: "bg-[#fff0f0] text-[#b64949]" };
  return <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold", styles[tone])}><span className={cn("h-1.5 w-1.5 rounded-full", tone === "success" ? "bg-[#F2B941]" : tone === "warning" ? "bg-[#FDCD5E]" : tone === "danger" ? "bg-[#e06868]" : "bg-slate-400")} />{children}</span>;
}

export function EmptyData({ title = "No data available", description = "Connect the persistence layer and complete an inspection to populate this view.", compact = false }: { title?: string; description?: string; compact?: boolean }) {
  return <div className={cn("flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white/70 text-center", compact ? "min-h-[180px] p-6" : "min-h-[280px] p-8")}><div className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-400"><Database className="h-5 w-5" /></div><p className="text-sm font-semibold text-slate-700">{title}</p><p className="mt-1 max-w-sm text-xs leading-5 text-slate-400">{description}</p></div>;
}

export function DataSourceNote({ configured }: { configured: boolean }) {
  return <div className={cn("mb-5 flex items-start gap-3 rounded-2xl border px-4 py-3 text-xs leading-5", configured ? "border-[#bceee4] bg-[#edfcf9] text-[#247d70]" : "border-[#f0dfb9] bg-[#fffaf0] text-[#966d2a]")}><Info className="mt-0.5 h-4 w-4 shrink-0" /><p>{configured ? "Live database connected. Metrics below are calculated from stored inspection records." : "Database not configured in this environment. The UI is ready, but it will not fabricate inspection, production, sensor, or model metrics."}</p>{!configured && <ArrowUpRight className="ml-auto mt-0.5 h-4 w-4 shrink-0" />}</div>;
}
