import { useCallback, useEffect, useRef, useState } from "react";
import {
  getToken, clearToken,
  startDeviceFlow, pollDeviceFlow,
  getAuthenticatedUser,
} from "../engine/github.js";

const CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID || "";

export default function useGitHub() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [deviceFlow, setDeviceFlow] = useState(null); // { user_code, verification_uri }
  const abortRef = useRef(null);

  const token = getToken();
  const isAuthenticated = !!user;

  // Check existing token on mount
  useEffect(() => {
    const saved = getToken();
    if (!saved) {
      setLoading(false);
      return;
    }
    getAuthenticatedUser(saved)
      .then(setUser)
      .catch(() => {
        clearToken();
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async () => {
    if (!CLIENT_ID) {
      console.warn("VITE_GITHUB_CLIENT_ID not set");
      return;
    }
    try {
      setLoading(true);
      const flow = await startDeviceFlow(CLIENT_ID);
      setDeviceFlow({
        user_code: flow.user_code,
        verification_uri: flow.verification_uri,
      });

      const abort = new AbortController();
      abortRef.current = abort;

      const result = await pollDeviceFlow(CLIENT_ID, flow.device_code, flow.interval, abort.signal);
      if (result.access_token) {
        const u = await getAuthenticatedUser(result.access_token);
        setUser(u);
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        console.error("GitHub login failed:", err);
      }
    } finally {
      setDeviceFlow(null);
      setLoading(false);
      abortRef.current = null;
    }
  }, []);

  const cancelLogin = useCallback(() => {
    abortRef.current?.abort();
    setDeviceFlow(null);
    setLoading(false);
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  return {
    isAuthenticated,
    user,
    loading,
    token,
    login,
    logout,
    deviceFlow,
    cancelLogin,
    clientIdConfigured: !!CLIENT_ID,
  };
}
