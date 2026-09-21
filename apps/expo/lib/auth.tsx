import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { unregisterPush } from "@/lib/push";
import * as WebBrowser from "expo-web-browser";
import { api, API_URL } from "./api";

interface User {
  id: string;
  first_name: string;
  last_name: string;
  name?: string;
  email: string;
  role: string;
  // Optional: the API always returns it, but a freshly registered user has no
  // avatar yet. The profile screen reads this.
  avatar?: string;
}

// A login ends in one of two places: signed in, or holding a short-lived
// pending token because the account has 2FA on and this device is not trusted.
export interface TOTPChallenge {
  totpRequired: true;
  pendingToken: string;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<TOTPChallenge | null>;
  verifyTOTP: (args: {
    pendingToken: string;
    code: string;
    trustDevice?: boolean;
    backup?: boolean;
  }) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  register: (firstName: string, lastName: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  login: async () => null,
  verifyTOTP: async () => {},
  loginWithGoogle: async () => {},
  register: async () => {},
  logout: async () => {},
  refreshUser: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      // No stored session → don't touch the network. This is what keeps a
      // fresh install from sitting on the splash screen while a doomed
      // /auth/me request waits out its timeout.
      if (!(await api.hasToken())) {
        setUser(null);
        return;
      }
      const res = await api.get("/auth/me");
      setUser(res.data);
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.post("/auth/login", { email, password });

    // Reading res.data.tokens straight away is what used to break: on a 2FA
    // account that field does not exist, so the app threw instead of asking
    // for a code — leaving anyone with 2FA on unable to sign in at all.
    if (res.data?.totp_required && res.data?.pending_token) {
      return { totpRequired: true, pendingToken: res.data.pending_token } as TOTPChallenge;
    }

    await api.setTokens(res.data.tokens.access_token, res.data.tokens.refresh_token);
    setUser(res.data.user);
    return null;
  }, []);

  // Finishes a login that stopped at the 2FA prompt. An authenticator code and
  // a backup code differ only by endpoint, so one function covers both.
  const verifyTOTP = useCallback(
    async ({ pendingToken, code, trustDevice = false, backup = false }: {
      pendingToken: string;
      code: string;
      trustDevice?: boolean;
      backup?: boolean;
    }) => {
      const path = backup ? "/auth/totp/backup-codes/verify" : "/auth/totp/verify";
      const res = await api.post(path, {
        pending_token: pendingToken,
        code: code.trim(),
        trust_device: trustDevice,
      });
      await api.setTokens(res.data.tokens.access_token, res.data.tokens.refresh_token);
      setUser(res.data.user);
    },
    []
  );

  const loginWithGoogle = useCallback(async () => {
    const callbackUrl = "myapp://callback";
    const result = await WebBrowser.openAuthSessionAsync(
      `${API_URL}/auth/oauth/google?redirect_uri=${encodeURIComponent(callbackUrl)}`,
      callbackUrl
    );

    if (result.type === "success" && result.url) {
      const url = new URL(result.url);
      const accessToken = url.searchParams.get("access_token");
      const refreshToken = url.searchParams.get("refresh_token");

      if (accessToken && refreshToken) {
        await api.setTokens(accessToken, refreshToken);
        await loadUser();
      } else {
        throw new Error("OAuth callback missing tokens");
      }
    } else if (result.type === "cancel") {
      throw new Error("Login cancelled");
    }
  }, []);

  const register = useCallback(async (firstName: string, lastName: string, email: string, password: string) => {
    const res = await api.post("/auth/register", { first_name: firstName, last_name: lastName, email, password });
    await api.setTokens(res.data.tokens.access_token, res.data.tokens.refresh_token);
    setUser(res.data.user);
  }, []);

  const logout = useCallback(async () => {
    // First, while the session can still prove the token is this user's.
    await unregisterPush();
    try {
      await api.post("/auth/logout", {});
    } catch {
      // Ignore errors on logout
    }
    await api.clearTokens();
    setUser(null);
  }, []);

  // Re-fetch the current user (e.g. after a profile/avatar update).
  const refreshUser = useCallback(async () => {
    try {
      const res = await api.get("/auth/me");
      setUser(res.data);
    } catch {
      // Keep the current user on a transient failure.
    }
  }, []);

  return (
    <AuthContext value={{ user, isAuthenticated: !!user, isLoading, login, verifyTOTP, loginWithGoogle, register, logout, refreshUser }}>
      {children}
    </AuthContext>
  );
}

export const useAuth = () => useContext(AuthContext);
