import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

/**
 * Next 16 proxy (formerly middleware). Runs on the network boundary before
 * routes are rendered and keeps the Supabase auth session fresh.
 */
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // Skip static assets and the local uploads directory so they are never
  // intercepted. Everything else (pages, API routes) gets the session refresh.
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|uploads/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|mp4|webm|ogg|mov)$).*)",
  ],
};
