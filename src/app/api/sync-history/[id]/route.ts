import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { syncHistory } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const recordId = parseInt(id, 10);

    await db.delete(syncHistory).where(eq(syncHistory.id, recordId));

    return NextResponse.json({ success: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete sync history";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
