import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

interface CreateUserRequest {
  email?: string;
  password?: string;
  role?: "admin" | "college";
  collegeName?: string;
  collegeCode?: string;
  avatarUrl?: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function buildCorsHeaders(req: Request): Record<string, string> {
  const allowedOrigin = Deno.env.get("ALLOWED_ORIGIN") ?? "";
  const requestOrigin = req.headers.get("Origin") ?? "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };

  if (allowedOrigin && requestOrigin === allowedOrigin) {
    headers["Access-Control-Allow-Origin"] = allowedOrigin;
  }

  return headers;
}

function jsonResponse(
  status: number,
  body: Record<string, unknown>,
  corsHeaders: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isValidHttpsUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:";
  } catch {
    return false;
  }
}

Deno.serve(async (req: Request) => {
  const corsHeaders = buildCorsHeaders(req);

  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" }, corsHeaders);
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return jsonResponse(401, { error: "Unauthorized" }, corsHeaders);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    const supabaseClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const {
      data: { user: callerUser },
      error: authError,
    } = await supabaseClient.auth.getUser();

    if (authError || !callerUser) {
      return jsonResponse(401, { error: "Authentication failed" }, corsHeaders);
    }

    // Strictly verify server-managed app_metadata.role (never user_metadata)
    if (callerUser.app_metadata?.role !== "admin") {
      return jsonResponse(
        403,
        { error: "Forbidden: admin access required" },
        corsHeaders,
      );
    }

    const body = (await req.json()) as CreateUserRequest;
    const email = typeof body.email === "string" ? body.email.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const role = body.role ?? "college";
    const collegeName =
      typeof body.collegeName === "string" ? body.collegeName.trim() : "";
    const collegeCode =
      typeof body.collegeCode === "string"
        ? body.collegeCode.trim().toUpperCase()
        : "";
    const avatarUrl =
      typeof body.avatarUrl === "string" ? body.avatarUrl.trim() : "";

    if (!EMAIL_RE.test(email)) {
      return jsonResponse(
        400,
        { error: "A valid email address is required" },
        corsHeaders,
      );
    }

    if (password.length < 8) {
      return jsonResponse(
        400,
        { error: "Password must be at least 8 characters" },
        corsHeaders,
      );
    }

    if (role !== "admin" && role !== "college") {
      return jsonResponse(400, { error: "Invalid role" }, corsHeaders);
    }

    if (role === "college" && !collegeName) {
      return jsonResponse(
        400,
        { error: "College name is required for college accounts" },
        corsHeaders,
      );
    }

    if (avatarUrl && !isValidHttpsUrl(avatarUrl)) {
      return jsonResponse(
        400,
        { error: "Avatar URL must use https://" },
        corsHeaders,
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data: newUser, error: createError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        app_metadata: { role },
      });

    if (createError || !newUser.user) {
      console.error("Failed to create auth user:", createError);
      return jsonResponse(
        400,
        { error: "Failed to create user account" },
        corsHeaders,
      );
    }

    if (role === "college") {
      const { error: collegeError } = await supabaseAdmin
        .from("colleges")
        .insert({
          user_id: newUser.user.id,
          name: collegeName,
          code: collegeCode || null,
          avatar_url: avatarUrl || null,
        });

      if (collegeError) {
        console.error("Failed to create college record:", collegeError);
        // Roll back newly created auth user so no orphaned account remains
        const { error: rollbackError } =
          await supabaseAdmin.auth.admin.deleteUser(newUser.user.id);
        if (rollbackError) {
          console.error("Rollback deleteUser failed:", rollbackError);
        }
        return jsonResponse(
          400,
          { error: "Failed to create college profile" },
          corsHeaders,
        );
      }
    }

    return jsonResponse(
      200,
      { success: true, user_id: newUser.user.id },
      corsHeaders,
    );
  } catch (err: unknown) {
    console.error("Unhandled create-college-user error:", err);
    return jsonResponse(500, { error: "Internal server error" }, corsHeaders);
  }
});
