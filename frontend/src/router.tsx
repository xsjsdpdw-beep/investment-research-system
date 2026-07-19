import { createBrowserRouter, Navigate } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Calendar } from "@/pages/Calendar";
import { Intel } from "@/pages/Intel";
import { Framework } from "@/pages/Framework";
import { Sectors } from "@/pages/Sectors";
import { SectorDetail } from "@/pages/SectorDetail";
import { Watchlist } from "@/pages/Watchlist";
import { Notes } from "@/pages/Notes";
import { Database } from "@/pages/Database";
import { Template } from "@/pages/Template";
import { Settings } from "@/pages/Settings";
import { Portfolio } from "@/pages/Portfolio";
import { DecisionCockpit } from "@/pages/DecisionCockpit";

export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: "/", element: <Navigate to="/calendar" replace /> },
      { path: "/calendar", element: <Calendar /> },
      { path: "/daily-review", element: <Navigate to="/intel" replace /> },
      { path: "/portfolio", element: <Portfolio /> },
      { path: "/stock-data", element: <Navigate to="/database?sub=stock-data" replace /> },
      { path: "/my-reports", element: <Navigate to="/framework" replace /> },
      { path: "/sectors", element: <Sectors /> },
      { path: "/sectors/:key", element: <SectorDetail /> },
      { path: "/intel", element: <Intel /> },
      { path: "/decision-cockpit", element: <DecisionCockpit /> },
      { path: "/watchlist", element: <Watchlist /> },
      { path: "/memos", element: <Notes /> },
      { path: "/notes", element: <Navigate to="/memos" replace /> },
      { path: "/framework", element: <Framework /> },
      { path: "/database", element: <Database /> },
      { path: "/templates", element: <Template /> },
      { path: "/settings", element: <Settings /> },
    ],
  },
]);
