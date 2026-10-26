// Creates an admin, or sets a new password for an existing one (signing them out everywhere).
// Usage: npm run admin:create -- '<id>' '<password>'
import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";

const [username, password] = process.argv.slice(2);
if (!username || !password) {
  console.error("Usage: npm run admin:create -- '<id>' '<password>'");
  process.exit(1);
}

const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Add it to .env.local.");
  process.exit(1);
}

const sql = neon(url);
const hash = await bcrypt.hash(password, 12);
const [row] = await sql`
  INSERT INTO admins (username, password_hash)
  VALUES (${username.trim()}, ${hash})
  ON CONFLICT (username) DO UPDATE
    SET password_hash = EXCLUDED.password_hash,
        session_version = admins.session_version + 1
  RETURNING (xmax = 0) AS created
`;
console.log(`${row.created ? "Created" : "Updated"} admin "${username.trim()}".`);
