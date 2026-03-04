import { NextRequest, NextResponse } from "next/server";
import { runOrderSync } from "@/lib/sync/syncRunner";

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const fullHistory = searchParams.get("fullHistory") === "true";
    const result = await runOrderSync({ force: true, fullHistory });
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Order sync failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
