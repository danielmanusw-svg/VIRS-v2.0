import { NextRequest, NextResponse } from "next/server";
import { runOrderSync } from "@/lib/sync/syncRunner";

export async function GET(request: NextRequest) {
  // Validate Authorization header
  const authHeader = request.headers.get("Authorization");
  const expected = `Bearer ${process.env.CRON_SECRET}`;

  if (!authHeader || authHeader !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    // runOrderSync checks frequency internally — it will return "skipped" if not due
    const result = await runOrderSync();
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
