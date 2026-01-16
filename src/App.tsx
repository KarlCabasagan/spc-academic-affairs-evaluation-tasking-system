import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { AdminLayout, CollegeLayout } from "./components/layout";
import { ToastContainer } from "./components/ui";
import { Loading } from "./components/ui";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import { CollegeDashboard, CollegeEvaluate } from "./pages/college";
import {
  Login,
  Register,
  Dashboard,
  Areas,
  Questions,
  Colleges,
  Responses,
  Reports,
  PreviewCollege,
} from "./pages/admin";

// Root redirect component
function RootRedirect() {
  const { user, userRole, isLoading } = useAuth();

  if (isLoading) {
    return <Loading fullScreen text="Loading..." />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (userRole === "college") {
    return <Navigate to="/college" replace />;
  }

  return <Navigate to="/admin/dashboard" replace />;
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* Root - Redirect based on auth state */}
          <Route path="/" element={<RootRedirect />} />

          {/* Auth Routes */}
          <Route path="/login" element={<Login />} />
          <Route
            path="/admin/login"
            element={<Navigate to="/login" replace />}
          />
          <Route path="/admin/register" element={<Register />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />

          {/* Admin Routes */}
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Navigate to="/admin/dashboard" replace />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="areas" element={<Areas />} />
            <Route path="areas/:areaId" element={<Questions />} />
            <Route path="colleges" element={<Colleges />} />
            <Route path="responses" element={<Responses />} />
            <Route path="reports" element={<Reports />} />
            <Route path="preview-college" element={<PreviewCollege />} />
          </Route>

          {/* College Routes */}
          <Route path="/college" element={<CollegeLayout />}>
            <Route index element={<CollegeDashboard />} />
            <Route path="evaluate/:areaId" element={<CollegeEvaluate />} />
          </Route>

          {/* 404 - Redirect to root */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
      <ToastContainer />
    </AuthProvider>
  );
}

export default App;
