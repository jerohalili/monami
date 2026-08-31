import { auth } from "@/lib/auth";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isLoggedIn = !!req.auth;

  const isAuthPage = pathname === "/login" || pathname === "/register";
  const isApiAuth = pathname.startsWith("/api/auth");
  const isApi = pathname.startsWith("/api/");

  // Let NextAuth handle its own routes
  if (isApiAuth) {
    return NextResponse.next();
  }

  // For API routes, let them handle auth themselves (return 401)
  if (isApi) {
    return NextResponse.next();
  }

  // Redirect logged-in users away from auth pages
  if (isLoggedIn && isAuthPage) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  // Redirect unauthenticated users to login
  if (!isLoggedIn && !isAuthPage) {
    return NextResponse.redirect(new URL("/login", req.url));
  }

  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|icon\\.svg|globals.css).*)"],
};
