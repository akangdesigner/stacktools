import { auth } from "@/auth"
import { NextResponse } from "next/server"

export default auth((req) => {
  const isLoggedIn = !!req.auth
  const { pathname } = req.nextUrl

  // LIFF 頁（/liff 開頭）從 LINE App 內開啟，靠 LINE 自身登入取得使用者，
  // 不該被網站的 Google 登入擋 → 一律公開放行
  if (pathname.startsWith("/liff")) {
    return NextResponse.next()
  }

  if (!isLoggedIn && pathname !== "/login") {
    return NextResponse.redirect(new URL("/login", req.nextUrl.origin))
  }

  if (isLoggedIn && pathname === "/login") {
    return NextResponse.redirect(new URL("/", req.nextUrl.origin))
  }
})

export const config = {
  // 只保護頁面路由，API 路由不擋（外部服務如 n8n 需能直接呼叫）
  matcher: [
    "/((?!api/|_next/static|_next/image|favicon\\.ico|.*\\.png$).*)",
  ],
}
