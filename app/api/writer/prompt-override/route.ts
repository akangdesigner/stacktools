import { NextRequest, NextResponse } from 'next/server';
import { getUserPromptOverrides, setUserPromptOverride, deleteUserPromptOverride } from '@/lib/writerDb';
import { auth } from '@/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return NextResponse.json({});
  return NextResponse.json(getUserPromptOverrides(email));
}

export async function POST(req: NextRequest) {
  const session = await auth();
  const email = session?.user?.email;
  if (!email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { stage, prompt_text } = await req.json();
  if (!stage) return NextResponse.json({ error: 'stage required' }, { status: 400 });
  if (prompt_text === null || prompt_text === undefined) {
    deleteUserPromptOverride(email, stage);
  } else {
    setUserPromptOverride(email, stage, String(prompt_text));
  }
  return NextResponse.json({ ok: true });
}
