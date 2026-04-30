import { auth } from "@/auth"
import { NextResponse } from "next/server"

export default auth((req) => {
  const isLoggedIn = !!req.auth
  const { pathname } = req.nextUrl

  if (!isLoggedIn && pathname !== "/login") {
    return NextResponse.redirect(new URL("/login", req.nextUrl.origin))
  }

  if (isLoggedIn && pathname === "/login") {
    return NextResponse.redirect(new URL("/", req.nextUrl.origin))
  }
})

export const config = {
  // 排除 NextAuth 自身、GSC OAuth、靜態資源、圖片
  matcher: [
    "/((?!api/auth|api/gsc|_next/static|_next/image|favicon\\.ico|.*\\.png$).*)",
  ],
}
