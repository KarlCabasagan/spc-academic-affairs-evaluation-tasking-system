import { supabase } from "./supabase";

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
