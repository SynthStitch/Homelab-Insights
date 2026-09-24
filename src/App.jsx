import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import SignInPage from "./pages/SignInPage";
// ponytail: lazy so the landing page never downloads three/echarts
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const AdminPage = lazy(() => import("./pages/AdminPage"));
import LearnPage from "./pages/LearnPage";
import ContactPage from "./pages/ContactPage";
import RequireAuth from "./components/RequireAuth.jsx";
import AssistantChat from "./components/AssistantChat.jsx";
import Navbar from "./components/Navbar.jsx";
import Atmosphere from "./components/Atmosphere.jsx";
import { useAuth } from "./context/AuthContext.jsx";
import "./App.css";

function AppShell() {
  const { auth, logout } = useAuth();

  const navItems = [
    { name: "Home", link: "/" },
    { name: "How it works", link: "/overview" },
    { name: "Contact", link: "/contact" },
  ];
  if (auth?.token) {
    navItems.push({ name: "Dashboard", link: "/dashboard" });
    if (auth?.payload?.role === "admin") {
      navItems.push({ name: "Admin", link: "/admin" });
    }
  }

  return (
    <div className="app-shell">
      <Atmosphere />
      <Navbar
        items={navItems}
        isAuthed={Boolean(auth?.token)}
        username={auth?.payload?.username ?? auth?.payload?.sub}
        onLogout={logout}
      />
      <main className="app-content">
        <Suspense fallback={<div className="page"><p className="eyebrow">loading</p></div>}>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/overview" element={<LearnPage />} />
          <Route path="/learn" element={<Navigate to="/overview" replace />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route path="/sign-in" element={<SignInPage />} />
          <Route
            path="/dashboard"
            element={
              <RequireAuth>
                <DashboardPage />
              </RequireAuth>
            }
          />
          <Route path="/users" element={<Navigate to="/admin" replace />} />
          <Route
            path="/admin"
            element={
              <RequireAuth role="admin">
                <AdminPage />
              </RequireAuth>
            }
          />
        </Routes>
        </Suspense>
      </main>
      <AssistantChat />
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}

export default App;
