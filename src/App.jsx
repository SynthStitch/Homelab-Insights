import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import LandingPage from "./pages/LandingPage";
import SignInPage from "./pages/SignInPage";
import DashboardPage from "./pages/DashboardPage";
import UserManagementPage from "./pages/UserManagementPage";
import RequireAuth from "./components/RequireAuth.jsx";
import { useAuth } from "./context/AuthContext.jsx";
import "./App.css";

function App() {
  const { auth, logout } = useAuth();

  return (
    <BrowserRouter>
      <div className="app-shell">
        <nav className="app-nav">
          <h1 className="app-title">Homelab Insights</h1>
          <div className="nav-links">
            <Link to="/">Landing</Link>
            <Link to="/dashboard">Dashboard</Link>
            {auth?.payload?.role === "admin" && <Link to="/users">Users</Link>}
            {auth?.token ? (
              <button type="button" onClick={logout} className="nav-button">
                Sign Out
              </button>
            ) : (
              <Link to="/sign-in">Sign In</Link>
            )}
          </div>
        </nav>
        <main className="app-content">
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/sign-in" element={<SignInPage />} />
            <Route
              path="/users"
              element={
                <RequireAuth role="admin">
                  <UserManagementPage />
                </RequireAuth>
              }
            />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
}

export default App;
