import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

const INACTIVITY_MS = 15 * 60 * 1000;
const LAST_ACTIVE_KEY = "schoolorder.lastActive";

type Ctx = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  timedOut: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<Ctx>({
  session: null,
  user: null,
  loading: true,
  timedOut: false,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setLoading(false);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  // 15 minutes of inactivity -> sign out. Timestamp is kept in localStorage so
  // a backgrounded tab that never fires timers is still logged out on return.
  useEffect(() => {
    if (!session) return;
    const touch = () => window.localStorage.setItem(LAST_ACTIVE_KEY, String(Date.now()));
    touch();
    const events = ["click", "keydown", "touchstart", "scroll", "visibilitychange"];
    events.forEach((e) => window.addEventListener(e, touch, { passive: true }));

    const interval = window.setInterval(() => {
      const last = Number(window.localStorage.getItem(LAST_ACTIVE_KEY) ?? Date.now());
      if (Date.now() - last > INACTIVITY_MS) {
        setTimedOut(true);
        void supabase.auth.signOut();
      }
    }, 30_000);

    return () => {
      events.forEach((e) => window.removeEventListener(e, touch));
      window.clearInterval(interval);
    };
  }, [session]);

  const value = useMemo<Ctx>(
    () => ({
      session,
      user: session?.user ?? null,
      loading,
      timedOut,
      signOut: async () => {
        setTimedOut(false);
        await supabase.auth.signOut();
      },
    }),
    [session, loading, timedOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
