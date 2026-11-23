import { createContext, useContext } from "react";
import type { User, Session } from "@supabase/supabase-js";
import type { UserRole, College } from "../lib/types";

export interface AuthContextType {
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

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
