import { NextRequest, NextResponse } from 'next/server';
import { createErrorLog, getErrorLogs, deleteErrorLog } from '@/lib/silverDb';

export const dynamic = 'force-dynamic';

// POST /api/silver/errors
// body: { workflowName?, nodeName?, message?, executionUrl? }
// 由 n8n Error Trigger 工作流呼叫，記錄錯誤
export async function POST(req: NextRequest) {
  const { workflowName, nodeName, message, executionUrl } = await req.json();
  const id = createErrorLog(
    workflowName ?? null,
    nodeName ?? null,
    message ?? null,
    executionUrl ?? null
  );
  return NextResponse.json({ id });
}

export async function GET() {
  return NextResponse.json({ errors: getErrorLogs() });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'missing id' }, { status: 400 });
  deleteErrorLog(Number(id));
  return NextResponse.json({ ok: true });
}
