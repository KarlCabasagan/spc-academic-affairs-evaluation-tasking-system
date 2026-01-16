import { supabase } from "./supabase";
import type { UserRole, College } from "./types";

/**
 * Get the currently authenticated user
 */
export async function getCurrentUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return null;
  }

  return user;
}

/**
 * Get the role of the current user (admin or college)
 */
export async function getUserRole(): Promise<UserRole | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const { data, error } = await supabase.rpc("get_user_role", {
    user_uuid: user.id,
  });

  if (error) {
    console.error("Error getting user role:", error);
    return null;
  }

  return data as UserRole;
}

/**
 * Get the college profile for the current user (if they are a college user)
 */
export async function getCollegeProfile(): Promise<College | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const { data, error } = await supabase.rpc("get_college_by_user", {
    user_uuid: user.id,
  });

  if (error) {
    console.error("Error getting college profile:", error);
    return null;
  }

  if (!data || data.length === 0) {
    return null;
  }

  return data[0] as College;
}

/**
 * Check if current user is an admin
 */
export async function isAdmin(): Promise<boolean> {
  const role = await getUserRole();
  return role === "admin";
}

/**
 * Check if current user is a college user
 */
export async function isCollege(): Promise<boolean> {
  const role = await getUserRole();
  return role === "college";
}

/**
 * Sign out the current user
 */
export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error("Error signing out:", error);
    throw error;
  }
}

/**
 * Send password reset email
 */
export async function sendPasswordReset(email: string): Promise<boolean> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });

  if (error) {
    console.error("Error sending password reset:", error);
    return false;
  }

  return true;
}

/**
 * Update password (used after reset link)
 */
export async function updatePassword(newPassword: string): Promise<boolean> {
  const { error } = await supabase.auth.updateUser({
    password: newPassword,
  });

  if (error) {
    console.error("Error updating password:", error);
    return false;
  }

  return true;
}
