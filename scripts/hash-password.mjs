// Usage: npm run hash-password -- 'your-admin-password'
import bcrypt from "bcryptjs";

const password = process.argv[2];
if (!password || password.length < 12) {
  console.error("Provide a password of at least 12 characters: npm run hash-password -- '<password>'");
  process.exit(1);
}

const hash = await bcrypt.hash(password, 12);
console.log("\nVercel env var (paste as-is):");
console.log(`  ADMIN_PASSWORD_HASH=${hash}`);
console.log("\n.env.local (dollar signs escaped, since Next.js expands $ in .env files):");
console.log(`  ADMIN_PASSWORD_HASH=${hash.replaceAll("$", "\\$")}\n`);
