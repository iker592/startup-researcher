/**
 * 🔐 Simple Auth Hook for Auth0
 * 
 * Handles OAuth flow via URL fragments and localStorage.
 */

import { useState, useEffect, useCallback } from "react";

const AUTH_URL = import.meta.env.VITE_AUTH_URL || `${import.meta.env.VITE_API_URL || ""}/auth`;
const TOKEN_KEY = "auth_token";

interface User {
  sub: string;
  name?: string;
  email?: string;
  picture?: string;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState<string | null>(null);

  // Check for tokens in URL fragment (after OAuth redirect)
  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (hash) {
      const params = new URLSearchParams(hash);
      const accessToken = params.get("access_token");
      const error = params.get("error");
      
      if (error) {
        console.error("Auth error:", error);
      } else if (accessToken) {
        localStorage.setItem(TOKEN_KEY, accessToken);
        setToken(accessToken);
        // Clear hash from URL
        window.history.replaceState(null, "", window.location.pathname);
      }
    } else {
      // Check localStorage for existing token
      const storedToken = localStorage.getItem(TOKEN_KEY);
      if (storedToken) {
        setToken(storedToken);
      }
    }
    setLoading(false);
  }, []);

  // Fetch user info when token is available
  useEffect(() => {
    if (!token) {
      setUser(null);
      return;
    }

    fetch(`${AUTH_URL}/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Token invalid");
        return res.json();
      })
      .then((data) => setUser(data))
      .catch(() => {
        // Token invalid, clear it
        localStorage.removeItem(TOKEN_KEY);
        setToken(null);
        setUser(null);
      });
  }, [token]);

  const login = useCallback(() => {
    const redirectUri = window.location.origin;
    window.location.href = `${AUTH_URL}/authorize?redirect_uri=${encodeURIComponent(redirectUri)}`;
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
    // Optionally redirect to Auth0 logout
    window.location.href = `${AUTH_URL}/logout?returnTo=${encodeURIComponent(window.location.origin)}`;
  }, []);

  return {
    user,
    token,
    loading,
    isAuthenticated: !!user,
    login,
    logout,
  };
}
