import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import SignInPage from "./pages/SignInPage";
import DashboardPage from "./pages/DashboardPage";
import AdminPage from "./pages/AdminPage";
import LearnPage from "./pages/LearnPage";
import ContactPage from "./pages/ContactPage";
import { useLocation } from "react-router-dom";
import RequireAuth from "./components/RequireAuth.jsx";
import AssistantChat from "./components/AssistantChat.jsx";
import { useAuth } from "./context/AuthContext.jsx";
import ResizableNavbar from "./components/ui/ResizableNavbar.jsx";
import "./App.css";

function AppShell() {
  const { auth, logout } = useAuth();
  const location = useLocation();
  const path = location.pathname || "/";
  const peekNav = path.startsWith("/dashboard") || path.startsWith("/admin");

  const navItems = [
    { name: "Landing", link: "/" },
    { name: "Learn More", link: "/overview" },
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
      <ResizableNavbar
        items={navItems}
        isAuthed={Boolean(auth?.token)}
        onLogout={logout}
        peek={peekNav}
      />
      <main className="app-content">
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/overview" element={<LearnPage />} />
          <Route path="/learn" element={<Navigate to="/overview" replace />} />
          <Route path="/contact" element={<ContactPage />} />
          <Route
            path="/dashboard"
            element={
              <RequireAuth>
                <DashboardPage />
              </RequireAuth>
            }
          />
          <Route path="/sign-in" element={<SignInPage />} />
          <Route
            path="/users"
            element={
              <RequireAuth role="admin">
                <AdminPage />
              </RequireAuth>
            }
          />
          <Route
            path="/admin"
            element={
              <RequireAuth role="admin">
                <AdminPage />
              </RequireAuth>
            }
          />
        </Routes>
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
