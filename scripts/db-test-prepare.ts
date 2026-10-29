// Applies migrations to the test database named by TEST_DATABASE_URL.
import "dotenv/config";
import { execFileSync } from "node:child_process";

const url = process.env.TEST_DATABASE_URL;
if (!url) {
  console.error("TEST_DATABASE_URL não definido (veja .env.example).");
  process.exit(1);
}
execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], { stdio: "inherit", env: { ...process.env, DATABASE_URL: url } });
