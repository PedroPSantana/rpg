import "dotenv/config";

// Integration tests always target the dedicated test database.
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}
process.env.GM_PROVIDER = "offline";
