import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

// next dev の HMR で接続がリークしないようグローバルにキャッシュする (開発時のみ)。
declare global {
  // eslint-disable-next-line no-var
  var __prisma__: PrismaClient | undefined;
}

// Prisma 7 は driver adapter 必須。SQLite には better-sqlite3 アダプタを使う。
// DATABASE_URL は "file:./prisma/dev.db" 形式 (prisma.config.ts と揃える)。
// アダプタには `file:` プレフィックスを除いた path を渡す必要がある。
function create(): PrismaClient {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL is not set. Check .env (e.g. file:./prisma/dev.db).");
  }
  const path = url.startsWith("file:") ? url.slice("file:".length) : url;
  const adapter = new PrismaBetterSqlite3({ url: path });
  return new PrismaClient({ adapter });
}

export const prisma: PrismaClient = global.__prisma__ ?? create();

if (process.env.NODE_ENV !== "production") {
  global.__prisma__ = prisma;
}
