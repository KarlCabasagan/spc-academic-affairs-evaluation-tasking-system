import { Outlet } from "react-router-dom";
import Footer from "./Footer";
import Header from "./Header";

export default function PublicLayout() {
  return (
    <div className="min-h-screen flex flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2 focus:bg-white focus:text-maroon-800 focus:rounded-lg focus:shadow-lg focus:ring-2 focus:ring-maroon-800 font-medium text-sm"
      >
        Skip to main content
      </a>
      <Header />
      <main id="main-content" tabIndex={-1} className="flex-1 focus:outline-none">
        <Outlet />
      </main>
      <Footer />
    </div>
  );
}
