"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type Role = "admin" | "member";
export type Me = { id: string; username: string; role: Role } | null;

type RoleContextValue = {
  user: Me;
  role: Role | null;
  isAdmin: boolean;
  loading: boolean;
  refresh: () => Promise<void>;
};

const RoleContext = createContext<RoleContextValue | null>(null);

export function RoleProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Me>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/auth/me");
      const data = (await r.json()) as { user?: Me };
      setUser(data?.user ?? null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let cancel = false;
    fetch("/api/auth/me")
      .then((r) => r.json())
      .then((data: { user?: Me }) => {
        if (cancel) return;
        setUser(data?.user ?? null);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancel) setLoading(false);
      });
    return () => {
      cancel = true;
    };
  }, []);

  const role = user?.role ?? null;
  const isAdmin = role === "admin";

  return (
    <RoleContext.Provider value={{ user, role, isAdmin, loading, refresh }}>
      {children}
    </RoleContext.Provider>
  );
}

export function useRole(): RoleContextValue {
  const ctx = useContext(RoleContext);
  if (!ctx) throw new Error("useRole must be used inside <RoleProvider>");
  return ctx;
}
