import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import DashboardLayout from "./components/DashboardLayout";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Analytics from "./pages/Analytics";
import Home from "./pages/Home";
import Inspection from "./pages/Inspection";
import ModelPerformance from "./pages/ModelPerformance";
import NotFound from "./pages/NotFound";
import Roadmap from "./pages/Roadmap";
import History from "./pages/History";
import Settings from "./pages/Settings";
import InspectionDetail from "./pages/InspectionDetail";
import { Route, Switch } from "wouter";

function Router() {
  return <DashboardLayout><Switch><Route path="/" component={Home} /><Route path="/inspection" component={Inspection} /><Route path="/inspect" component={Inspection} /><Route path="/inspection/:inspectionId" component={InspectionDetail} /><Route path="/history" component={History} /><Route path="/analytics" component={Analytics} /><Route path="/model" component={ModelPerformance} /><Route path="/settings" component={Settings} /><Route path="/roadmap" component={Roadmap} /><Route path="/404" component={NotFound} /><Route component={NotFound} /></Switch></DashboardLayout>;
}

export default function App() {
  return <ErrorBoundary><ThemeProvider defaultTheme="light"><TooltipProvider><Toaster /><Router /></TooltipProvider></ThemeProvider></ErrorBoundary>;
}
