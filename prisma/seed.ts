import { PrismaClient } from "@prisma/client";
import { insertDemoData } from "../src/lib/demo";

const db = new PrismaClient();

async function main() {
  await db.edge.deleteMany();
  await db.person.deleteMany();
  await insertDemoData(db);
  console.log(`Seeded ${await db.person.count()} people and ${await db.edge.count()} edges.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
