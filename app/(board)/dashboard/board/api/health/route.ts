import { connectDB } from "@board/lib/mongodb";
import mongoose from "mongoose";

export const dynamic = "force-dynamic";

/**
 * GET /api/health
 *
 * Real health check that pings the actual MongoDB connection.
 * Returns 200 if the database is reachable, 503 if not.
 * This is NOT a stub — it will fail if MONGODB_URI is invalid.
 */
export async function GET() {
  try {
    await connectDB();

    // Perform an actual ping against the database
    const db = mongoose.connection.db;
    if (!db) {
      throw new Error("Database connection exists but db handle is null");
    }

    await db.admin().ping();

    return Response.json(
      {
        status: "ok",
        db: "connected",
        timestamp: new Date().toISOString(),
      },
      { status: 200 }
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown database error";

    return Response.json(
      {
        status: "error",
        db: "disconnected",
        error: message,
        timestamp: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
}
