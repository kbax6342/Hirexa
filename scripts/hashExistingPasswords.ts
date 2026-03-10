import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { config as loadEnv } from "dotenv";

for (const envFile of [".env.local", ".env"]) {
  const envPath = resolve(process.cwd(), envFile);
  if (existsSync(envPath)) {
    loadEnv({ path: envPath, override: false });
  }
}

const prisma = new PrismaClient();

async function run() {
 // TEMP: Allow running on dev database
// if (process.env.DATABASE_URL?.includes("delicate-lake")) {
//   throw new Error("Refusing to run script on production database.");
// }

  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      password: true,
    },
  });

  let hashedCount = 0;
  let skippedCount = 0;

  for (const user of users) {
    if (!user.password) {
      skippedCount += 1;
      continue;
    }

    if (user.password.startsWith("$2")) {
      skippedCount += 1;
      continue;
    }

    const hashed = await bcrypt.hash(user.password, 10);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: hashed,
      },
    });

    hashedCount += 1;
    console.log(`Hashed password for: ${user.email ?? user.id}`);
  }

  console.log(`Done. Hashed ${hashedCount} password(s); skipped ${skippedCount}.`);
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
