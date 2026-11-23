import {
  useEffect,
  useState,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import type { User, Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { UserRole, College } from "../lib/types";
import { showToast } from "../components/ui/toastBus";
import { AuthContext } from "./useAuth";

// Read role strictly from server-managed app_metadata; never trust user_metadata or default to admin
function getRoleFromMetadata(user: User | null): UserRole | null {
  if (!user) return null;
  const appRole = user.app_metadata?.role;
  if (appRole === "admin" || appRole === "college") {
    return appRole;
  }
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [college, setCollege] = useState<College | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const sessionSeqRef = useRef(0);

  const fetchCollegeProfile = useCallback(
    async (userId: string): Promise<College | null> => {
      try {
        const { data, error } = await supabase
          .from("colleges")
          .select("id, name, code, avatar_url")
          .eq("user_id", userId)
          .eq("is_active", true)
          .maybeSingle();

        if (error) {
          console.error("Error fetching college profile:", error);
          return null;
        }
        return (data as College | null) ?? null;
      } catch {
        return null;
      }
    },
    [],
  );

  const refreshCollege = useCallback(async () => {
    if (user && userRole === "college") {
      const profile = await fetchCollegeProfile(user.id);
      setCollege(profile);
    }
  }, [user, userRole, fetchCollegeProfile]);

  const signOut = useCallback(async () => {
    setIsLoading(true);
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error("Error signing out:", err);
    } finally {
      setCollege(null);
      setUser(null);
      setSession(null);
      setUserRole(null);
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Watch for college deletion or deactivation (auto-logout)
  useEffect(() => {
    if (!college || userRole !== "college") return;

    const channel = supabase
      .channel(`college-deletion-${college.id}`)
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "colleges",
          filter: `id=eq.${college.id}`,
        },
        () => {
          showToast("Your college account has been removed.", "error");
          void signOut();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "colleges",
          filter: `id=eq.${college.id}`,
        },
        (payload) => {
          if (
            payload.new &&
            (payload.new as { is_active?: boolean }).is_active === false
          ) {
            showToast("Your college account has been deactivated.", "error");
            void signOut();
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [college, userRole, signOut]);

  useEffect(() => {
    let active = true;

    const handleSession = async (nextSession: Session | null) => {
      const seq = ++sessionSeqRef.current;

      if (!nextSession?.user) {
        if (!active || seq !== sessionSeqRef.current) return;
        setSession(null);
        setUser(null);
        setUserRole(null);
        setCollege(null);
        setIsLoading(false);
        return;
      }

      const role = getRoleFromMetadata(nextSession.user);

      if (role === "college") {
        const profile = await fetchCollegeProfile(nextSession.user.id);
        if (!active || seq !== sessionSeqRef.current) return;

        if (!profile) {
          showToast(
            "This college account is inactive or no longer exists.",
            "error",
          );
          try {
            await supabase.auth.signOut();
          } catch {
            // Ignore signOut failure while offline
          }
          if (!active || seq !== sessionSeqRef.current) return;
          setSession(null);
          setUser(null);
          setUserRole(null);
          setCollege(null);
          setIsLoading(false);
          return;
        }

        setSession(nextSession);
        setUser(nextSession.user);
        setUserRole(role);
        setCollege(profile);
        setIsLoading(false);
        return;
      }

      if (!active || seq !== sessionSeqRef.current) return;
      setSession(nextSession);
      setUser(nextSession.user);
      setUserRole(role);
      setCollege(null);
      setIsLoading(false);
    };

    supabase.auth.getSession().then(({ data: { session: initialSession } }) => {
      void handleSession(initialSession);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (event === "INITIAL_SESSION") return;
      void handleSession(nextSession);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [fetchCollegeProfile]);

  const signIn = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        setIsLoading(false);
      }
      return { error: error as Error | null };
    } catch (err) {
      setIsLoading(false);
      return {
        error:
          err instanceof Error ? err : new Error("Authentication failed"),
      };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        userRole,
        college,
        isLoading,
        isOnline,
        signIn,
        signOut,
        refreshCollege,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
