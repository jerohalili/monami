// One-time cleanup: delete all github_indirect Person nodes and their edges.
// Run with: npx tsx scripts/cleanup-indirect.ts

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  // Use raw SQL since Prisma JSON filter doesn't work reliably on SQLite
  const indirectIds: { id: string }[] = await db.$queryRaw`
    SELECT id FROM Person WHERE tags LIKE '%github_indirect%'
  `;

  if (indirectIds.length === 0) {
    console.log("No github_indirect nodes found. Nothing to clean up.");
    return;
  }

  const ids = indirectIds.map((p) => p.id);
  console.log(`Found ${ids.length} github_indirect nodes to delete`);

  // Delete edges where source or target is an indirect node
  const deletedEdges = await db.edge.deleteMany({
    where: {
      OR: [
        { sourceId: { in: ids } },
        { targetId: { in: ids } },
      ],
    },
  });
  console.log(`Deleted ${deletedEdges.count} edges`);

  // Delete the indirect person nodes
  const deletedPeople = await db.person.deleteMany({
    where: {
      id: { in: ids },
    },
  });
  console.log(`Deleted ${deletedPeople.count} person nodes`);

  console.log("Cleanup complete!");
}

main()
  .catch((e) => {
    console.error("Cleanup failed:", e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
