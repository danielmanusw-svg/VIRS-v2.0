import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { settings, syncHistory } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET() {
  try {
    const allSettings = await db.select().from(settings);
    const recentSync = await db
      .select()
      .from(syncHistory)
      .orderBy(desc(syncHistory.started_at))
      .limit(20);

    return NextResponse.json({
      settings: allSettings[0] ?? null,
      sync_history: recentSync,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const allSettings = await db.select().from(settings);
    if (allSettings.length === 0) {
      return NextResponse.json({ error: "No settings found" }, { status: 404 });
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (body.sync_frequency_hours !== undefined) {
      updates.sync_frequency_hours = body.sync_frequency_hours;
    }

    await db
      .update(settings)
      .set(updates)
      .where(eq(settings.id, allSettings[0].id));

    return NextResponse.json({ success: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update settings";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
