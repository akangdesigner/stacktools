import { auth } from "@/auth";
import { redirect } from "next/navigation";

const ALLOWED_EMAIL = process.env.FINANCE_ALLOWED_EMAIL;

export default async function FinanceLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();

  if (!session?.user?.email) {
    redirect("/login");
  }

  if (session.user.email !== ALLOWED_EMAIL) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-10 text-center max-w-sm">
          <p className="text-2xl mb-3">🔒</p>
          <p className="text-base font-semibold text-gray-900 mb-2">存取被拒</p>
          <p className="text-sm text-gray-500">此工具僅限 HR 專用帳號使用</p>
          <p className="text-xs text-gray-400 mt-1">{session.user.email}</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
