import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";

const url = process.env.DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL is not set. Check .env (e.g. file:./prisma/dev.db).");
}
const path = url.startsWith("file:") ? url.slice("file:".length) : url;
const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: path }),
});

const EMPLOYEES = [
  "田中 太郎",
  "山田 花子",
  "佐藤 次郎",
  "鈴木 一郎",
  "高橋 美咲",
];

const CUSTOMERS = [
  "A 株式会社",
  "B 商事",
  "C ホールディングス",
  "D サービス",
  "E 工業",
];

const TASKS = [
  "打ち合わせ",
  "報告書作成",
  "現地対応",
  "見積もり提出",
  "研修",
];

async function main() {
  await Promise.all([
    ...EMPLOYEES.map((name) =>
      prisma.employee.upsert({
        where: { name },
        update: {},
        create: { name },
      }),
    ),
    ...CUSTOMERS.map((name) =>
      prisma.customer.upsert({
        where: { name },
        update: {},
        create: { name },
      }),
    ),
    ...TASKS.map((name) =>
      prisma.task.upsert({
        where: { name },
        update: {},
        create: { name },
      }),
    ),
  ]);

  const [employees, customers, tasks] = await Promise.all([
    prisma.employee.count(),
    prisma.customer.count(),
    prisma.task.count(),
  ]);
  console.log(
    `seed done: employees=${employees}, customers=${customers}, tasks=${tasks}`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
