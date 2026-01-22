import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import type { ReactNode } from "react";
import type { User, Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import type { UserRole, College } from "../lib/types";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  userRole: UserRole | null;
  college: College | null;
  isLoading: boolean;
  isOnline: boolean;
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  refreshCollege: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Get role from user metadata - synchronous, no DB call needed
function getRoleFromMetadata(user: User | null): UserRole | null {
  if (!user) return null;

  // Check app_metadata first (set by admin/service role)
  const appRole = user.app_metadata?.role as UserRole | undefined;
  if (appRole === "admin" || appRole === "college") {
    return appRole;
  }

  // Check user_metadata as fallback
  const userRole = user.user_metadata?.role as UserRole | undefined;
  if (userRole === "admin" || userRole === "college") {
    return userRole;
  }

  // Default to admin if no role set (for backwards compatibility)
  return "admin";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [userRole, setUserRole] = useState<UserRole | null>(null);
  const [college, setCollege] = useState<College | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // Fetch college profile for college users (background, non-blocking)
  const fetchCollegeProfile = async (
    userId: string,
  ): Promise<College | null> => {
    try {
      const { data } = await supabase
        .from("colleges")
        .select("id, name, code, avatar_url")
        .eq("user_id", userId)
        .eq("is_active", true)
        .maybeSingle();

      if (data) {
        setCollege(data as College);
        return data as College;
      }
      return null;
    } catch {
      // Ignore errors - college profile is optional enhancement
      return null;
    }
  };

  const refreshCollege = async () => {
    if (user && userRole === "college") {
      await fetchCollegeProfile(user.id);
    }
  };

  // Sign out function - memoized to use in subscriptions
  const signOut = useCallback(async () => {
    setIsLoading(true);
    await supabase.auth.signOut();
    setCollege(null);
    // onAuthStateChange handles the rest
  }, []);

  // Network status listeners
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

  // Watch for college deletion (auto-logout)
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
          // College was deleted - sign out immediately
          console.log("College account deleted, signing out...");
          signOut();
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
          // Check if deactivated
          if (
            payload.new &&
            (payload.new as { is_active?: boolean }).is_active === false
          ) {
            console.log("College account deactivated, signing out...");
            signOut();
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [college, userRole, signOut]);

  useEffect(() => {
    // Handle session updates - role is read synchronously from metadata
    const handleSession = (session: Session | null) => {
      setSession(session);
      setUser(session?.user ?? null);

      // Role is determined synchronously from metadata - NO DB call
      const role = getRoleFromMetadata(session?.user ?? null);
      setUserRole(role);

      // Fetch college profile in background if role is college
      if (session?.user && role === "college") {
        fetchCollegeProfile(session.user.id);
      } else {
        setCollege(null);
      }

      setIsLoading(false);
    };

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      handleSession(session);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // Skip INITIAL_SESSION - handled by getSession
      if (event === "INITIAL_SESSION") return;
      handleSession(session);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    setIsLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      setIsLoading(false);
    }
    // Success: onAuthStateChange handles the rest
    return { error: error as Error | null };
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

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
