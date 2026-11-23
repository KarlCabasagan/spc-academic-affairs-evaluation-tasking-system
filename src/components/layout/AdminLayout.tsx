import { useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
import { ExternalLinkIcon, Loading, MenuIcon } from "../ui";
import Sidebar from "./Sidebar";

export default function AdminLayout() {
  const { user, userRole, isLoading } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  if (isLoading) {
    return <Loading fullScreen text="Loading…" />;
  }

  if (!user || !userRole) {
    return <Navigate to="/login" replace />;
  }

  if (userRole !== "admin") {
    return (
      <Navigate
        to={userRole === "college" ? "/college" : "/login"}
        replace
      />
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2 focus:bg-white focus:text-maroon-800 focus:rounded-lg focus:shadow-lg focus:ring-2 focus:ring-maroon-800 font-medium text-sm"
      >
        Skip to main content
      </a>

      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white border-b border-gray-200 px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between lg:justify-end sticky top-0 z-30">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={sidebarOpen}
            aria-controls="admin-sidebar"
            className="lg:hidden w-11 h-11 inline-flex items-center justify-center rounded-lg text-gray-600 hover:text-gray-900 hover:bg-gray-100 active:scale-[0.97] transition-[background-color,color,transform] duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-maroon-800"
          >
            <MenuIcon className="w-6 h-6" />
          </button>

          <div className="flex items-center gap-4">
            <a
              href="/public"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-gray-600 hover:text-maroon-800 min-h-11 px-2 inline-flex items-center gap-1.5 rounded-lg transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-maroon-800"
            >
              <ExternalLinkIcon className="w-4 h-4" />
              View Public Site
            </a>
          </div>
        </header>

        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto focus:outline-none"
        >
          <Outlet />
        </main>
      </div>
    </div>
  );
}
