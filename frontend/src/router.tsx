import { createBrowserRouter, Navigate } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Calendar } from "@/pages/Calendar";
import { Intel } from "@/pages/Intel";
import { Framework } from "@/pages/Framework";
import { Watchlist } from "@/pages/Watchlist";
import { Notes } from "@/pages/Notes";
import { Database } from "@/pages/Database";
import { Template } from "@/pages/Template";
import { Settings } from "@/pages/Settings";
import { Portfolio } from "@/pages/Portfolio";

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
      { path: "/sectors", element: <Navigate to="/framework" replace /> },
      { path: "/sectors/:key", element: <Navigate to="/framework" replace /> },
      { path: "/intel", element: <Intel /> },
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
