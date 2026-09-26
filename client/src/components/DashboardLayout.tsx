import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { startLogin } from "@/const";
import { cn } from "@/lib/utils";
import NotificationCenter from "@/components/solarvision/NotificationCenter";
import { Activity, BarChart3, BrainCircuit, Factory, FileClock, LayoutDashboard, LogOut, Menu, PanelLeftClose, PanelLeftOpen, Route, ScanLine, Settings2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useLocation } from "wouter";

const menuItems = [
  { icon: LayoutDashboard, label: "Overview", path: "/" },
  { icon: ScanLine, label: "New inspection", path: "/inspection" },
  { icon: FileClock, label: "Inspection history", path: "/history" },
  { icon: BarChart3, label: "Defect analytics", path: "/analytics" },
  { icon: BrainCircuit, label: "Model performance", path: "/model" },
  { icon: Settings2, label: "Settings", path: "/settings" },
];

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [location, setLocation] = useLocation();
  const { user, logout } = useAuth();

  const navigate = (path: string) => {
    setLocation(path);
    setMobileOpen(false);
  };

  return (
    <div className="min-h-screen bg-[#EBE8D2] text-slate-950">
      <aside className={cn("fixed inset-y-0 left-0 z-50 flex w-[272px] flex-col bg-[#0B0909] text-white transition-transform duration-200 lg:translate-x-0", collapsed && "lg:w-[84px]", mobileOpen ? "translate-x-0" : "-translate-x-full")}>
        <div className="flex h-[84px] items-center gap-3 border-b border-white/10 px-5">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#F2B941] text-[#0B0909] shadow-[0_8px_24px_rgba(11,211,176,0.2)]"><Factory className="h-5 w-5" /></div>
          {!collapsed && <div className="min-w-0"><p className="truncate text-[15px] font-semibold tracking-tight">SolarVision <span className="text-[#F2B941]">AI</span></p><p className="mt-0.5 text-[10px] uppercase tracking-[0.22em] text-slate-400">Quality operations</p></div>}
        </div>
        <div className="flex-1 px-3 py-6">
          {!collapsed && <p className="px-3 pb-3 text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-500">Control center</p>}
          <nav className="space-y-1">
            {menuItems.map(item => {
              const active = location === item.path;
              return <button key={item.path} onClick={() => navigate(item.path)} className={cn("group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm transition-all", active ? "bg-[#F2B941] font-semibold text-[#0B0909] shadow-[0_8px_24px_rgba(11,211,176,0.15)]" : "text-slate-400 hover:bg-white/5 hover:text-white", collapsed && "justify-center px-2")} title={collapsed ? item.label : undefined}><item.icon className={cn("h-[18px] w-[18px] shrink-0", active ? "text-[#0B0909]" : "text-slate-500 group-hover:text-[#F2B941]")} />{!collapsed && <span>{item.label}</span>}</button>;
            })}
          </nav>
          {!collapsed && <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.04] p-4"><div className="mb-3 flex items-center gap-2 text-[#F2B941]"><ShieldCheck className="h-4 w-4" /><span className="text-[11px] font-semibold uppercase tracking-[0.16em]">M1 runtime</span></div><p className="text-xs leading-5 text-slate-400">YOLO defect inspection is connected. Sensor analytics and predictive maintenance remain extension points.</p></div>}
        </div>
        <div className="border-t border-white/10 p-3">
          <div className={cn("flex items-center gap-3 rounded-xl px-2 py-2", collapsed && "justify-center")}>
            <Avatar className="h-9 w-9 border border-white/15 bg-white/10"><AvatarFallback className="bg-[#143549] text-xs font-semibold text-[#F2B941]">{user?.name?.charAt(0).toUpperCase() || "O"}</AvatarFallback></Avatar>
            {!collapsed && <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-white">{user?.name || "Operator"}</p><p className="truncate text-[11px] text-slate-500">{user?.email || "Preview mode"}</p></div>}
            {!collapsed && user && <button className="text-slate-500 hover:text-white" onClick={logout} aria-label="Sign out"><LogOut className="h-4 w-4" /></button>}
          </div>
          {!collapsed && !user && <button onClick={() => startLogin()} className="mt-2 w-full rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-400 transition-colors hover:bg-white/5 hover:text-white">Sign in to save operator identity</button>}
        </div>
      </aside>
      <div className={cn("min-h-screen transition-[padding] duration-200 lg:pl-[272px]", collapsed && "lg:pl-[84px]")}>
        <header className="sticky top-0 z-40 flex h-[72px] items-center justify-between border-b border-slate-200/80 bg-[#EBE8D2]/90 px-5 backdrop-blur lg:px-8">
          <div className="flex items-center gap-3"><button className="rounded-lg p-2 text-slate-500 hover:bg-white lg:hidden" onClick={() => setMobileOpen(true)} aria-label="Open navigation"><Menu className="h-5 w-5" /></button><button className="hidden rounded-lg p-2 text-slate-500 hover:bg-white lg:block" onClick={() => setCollapsed(value => !value)} aria-label="Toggle navigation">{collapsed ? <PanelLeftOpen className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}</button><div><p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-400">Smart manufacturing / M1</p><p className="text-sm font-semibold text-slate-800">{menuItems.find(item => item.path === location)?.label || "Overview"}</p></div></div>
          <div className="flex items-center gap-3"><div className="hidden items-center gap-2 rounded-full border border-[#F2B941]/20 bg-[#FFF3C4] px-3 py-1.5 text-xs font-medium text-[#087e6d] sm:flex"><span className="h-1.5 w-1.5 rounded-full bg-[#F2B941] shadow-[0_0_0_4px_rgba(242,185,65,0.16)]" />Inference pipeline ready</div><NotificationCenter /><button onClick={() => navigate("/roadmap")} className="hidden items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900 md:flex"><Route className="h-3.5 w-3.5" />Roadmap</button></div>
        </header>
        <main className="mx-auto max-w-[1440px] px-5 py-7 lg:px-8">{children}</main>
      </div>
      {mobileOpen && <button className="fixed inset-0 z-40 bg-[#0B0909]/40 lg:hidden" onClick={() => setMobileOpen(false)} aria-label="Close navigation" />}
    </div>
  );
}
