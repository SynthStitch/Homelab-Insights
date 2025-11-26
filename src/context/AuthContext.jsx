import { createContext, useContext, useEffect, useMemo, useState } from "react";

const STORAGE_KEY = "homelab-auth";

const AuthContext = createContext(null);

function decodePayload(token) {
  try {
    const [, payload = ""] = token.split(".");
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
    const base64Decoder = (value) => {
      if (typeof atob === "function") {
        return atob(value);
      }
      const buf = globalThis?.Buffer;
      if (buf) {
        return buf.from(value, "base64").toString("binary");
      }
      throw new Error("No base64 decoder available in this environment");
    };
    const json = base64Decoder(padded);
    return JSON.parse(json);
  } catch (err) {
    console.warn("Failed to decode token payload", err);
    return null;
  }
}

export function AuthProvider({ children }) {
  const [auth, setAuth] = useState(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed?.token) return null;
      return {
        token: parsed.token,
        payload: decodePayload(parsed.token),
      };
    } catch (err) {
      console.warn("Failed to read auth state", err);
      return null;
    }
  });

  useEffect(() => {
    if (auth?.token) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: auth.token }));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, [auth]);

  const value = useMemo(() => {
    const login = (token) => {
      const payload = decodePayload(token);
      setAuth({ token, payload });
    };
    const logout = () => setAuth(null);

    return { auth, login, logout };
  }, [auth]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
