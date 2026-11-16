import mongoose from "mongoose";

/**
 * Serverless-safe MongoDB connection via Mongoose.
 *
 * On Vercel (and other serverless platforms), each function invocation may
 * or may not reuse a warm container. We cache the connection promise on
 * `globalThis` so that:
 *   - Warm invocations reuse the existing connection (no reconnect overhead).
 *   - Cold starts create exactly one connection (not one per concurrent request).
 *
 * This is the standard pattern recommended by Vercel and the MongoDB team
 * for Next.js serverless deployments.
 */

/**
 * Extend globalThis to cache the Mongoose connection promise.
 * This survives across warm invocations in the same serverless container.
 */
declare global {
  var mongooseConnection: {
    conn: typeof mongoose | null;
    promise: Promise<typeof mongoose> | null;
  };
}

// Initialize the cache if it doesn't exist yet (cold start)
if (!global.mongooseConnection) {
  global.mongooseConnection = { conn: null, promise: null };
}

const cached = global.mongooseConnection;

/**
 * Returns a cached Mongoose connection, creating one if necessary.
 * Safe to call from any API route or server action — concurrent calls
 * during a cold start will share the same connection promise.
 */
export async function connectDB(): Promise<typeof mongoose> {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error(
      "MONGODB_URI is not defined. Add it to .env.local (see .env.example)."
    );
  }

  // If we already have a ready connection, return it immediately
  if (cached.conn && cached.conn.connection.readyState === 1) {
    return cached.conn;
  }

  // If no connection promise exists yet, create one
  if (!cached.promise) {
    cached.promise = mongoose.connect(uri, {
      bufferCommands: false,
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (error) {
    // Reset the promise so the next call retries instead of returning
    // the same rejected promise forever
    cached.promise = null;
    throw error;
  }

  return cached.conn;
}
