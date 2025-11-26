import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import GlowInput from "./ui/GlowInput.jsx";

const API_BASE =
  typeof import.meta !== "undefined" && import.meta.env?.VITE_API_BASE
    ? import.meta.env.VITE_API_BASE.replace(/\/$/, "")
    : "http://localhost:4100";

function SignInForm() {
  const [form, setForm] = useState({ identifier: "", password: "" });
  const [status, setStatus] = useState({ message: "", variant: "info" });
  const [busy, setBusy] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!form.identifier || !form.password) {
      setStatus({ message: "Please provide both identifier and password.", variant: "error" });
      return;
    }
    if (form.password.length < 4) {
      setStatus({ message: "Password must be at least 4 characters long.", variant: "error" });
      return;
    }

    setBusy(true);
    setStatus({ message: "Signing in…", variant: "info" });
    try {
      const response = await fetch(`${API_BASE}/api/auth/signin`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ identifier: form.identifier, password: form.password }),
      });

      const data = await response
        .json()
        .catch(() => ({ error: `HTTP ${response.status} ${response.statusText}` }));

      if (!response.ok || !data?.token) {
        throw new Error(data?.error || "Sign in failed");
      }

      login(data.token);
      setStatus({ message: "Signed in successfully.", variant: "success" });
      const redirectTo = location.state?.from?.pathname ?? "/dashboard";
      setTimeout(() => {
        navigate(redirectTo, { replace: true });
      }, 200);
    } catch (err) {
      setStatus({ message: err.message || "Sign in failed", variant: "error" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <form className="sign-in-form" onSubmit={handleSubmit}>
        <GlowInput
          label="Username or Email"
          type="text"
          name="identifier"
          value={form.identifier}
          onChange={handleChange}
          placeholder="admin or admin@homelab.local"
          autoComplete="username"
          required
        />
        <GlowInput
          label="Password"
          type="password"
          name="password"
          value={form.password}
          onChange={handleChange}
          placeholder="********"
          autoComplete="current-password"
          required
        />
        <button type="submit" className="submit-button" disabled={busy}>
          {busy ? "Signing In…" : "Sign In"}
        </button>
      </form>
      {status.message && (
        <p className={`status-message status-${status.variant}`}>{status.message}</p>
      )}
    </>
  );
}

export default SignInForm;
