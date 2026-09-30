import { NextResponse, type NextRequest } from "next/server";

// HTTP Basic Auth for the whole app (pages and API). Required on Vercel
// production; optional locally.
export function proxy(req: NextRequest) {
  const user = process.env.BASIC_AUTH_USER;
  const pass = process.env.BASIC_AUTH_PASSWORD;
  if (!user || !pass) {
    if (process.env.VERCEL_ENV === "production") {
      return new NextResponse("Locked: set BASIC_AUTH_USER and BASIC_AUTH_PASSWORD in Vercel, then redeploy.", {
        status: 503,
      });
    }
    return NextResponse.next();
  }

  const header = req.headers.get("authorization") ?? "";
  const [scheme, encoded] = header.split(" ");
  if (scheme === "Basic" && encoded) {
    const [u, ...rest] = atob(encoded).split(":");
    if (u === user && rest.join(":") === pass) return NextResponse.next();
  }
  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Resilience Town"' },
  });
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
