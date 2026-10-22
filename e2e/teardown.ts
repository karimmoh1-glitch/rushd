import { Pool, neonConfig } from "@neondatabase/serverless";

// Removes the throwaway accounts the specs sign up (every child row
// cascades from User), so test runs leave nothing behind in the database.
export default async function teardown() {
  if (!process.env.DATABASE_URL) return;
  neonConfig.webSocketConstructor = globalThis.WebSocket;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rowCount } = await pool.query(`DELETE FROM "User" WHERE email LIKE 'e2e-%@example.com'`);
    const inquiries = await pool.query(`DELETE FROM "SchoolInquiry" WHERE email LIKE 'e2e-%@example.com'`);
    console.log(`e2e teardown: removed ${rowCount ?? 0} test account(s), ${inquiries.rowCount ?? 0} inquiry(s)`);
  } finally {
    await pool.end();
  }
}
