/**
 * Optional seed: inserts two clearly labeled DEMO entries for today (UTC) so the
 * dashboard can be explored without calling Passio. Values are illustrative.
 * Run: npm run db:seed
 */
import { loadConfig } from "../config.js";
import { createPrisma } from "./prisma.js";

const config = loadConfig();
const prisma = createPrisma(config.databaseUrl);

const demo = [
  { foodName: "[DEMO] Oatmeal", servingUnit: "1 cup (234 g)", servingWeightG: 234, cal: 166, p: 5.9, c: 28, f: 3.6 },
  { foodName: "[DEMO] Banana", servingUnit: "1 medium (118 g)", servingWeightG: 118, cal: 105, p: 1.3, c: 27, f: null },
];

for (const d of demo) {
  await prisma.foodLogEntry.create({
    data: {
      demoUserId: config.demoUserId,
      inputType: "text",
      inputSummary: "seeded demo data",
      foodName: d.foodName,
      servingUnit: d.servingUnit,
      servingWeightG: d.servingWeightG,
      servingQuantity: 1,
      caloriesPerServing: d.cal,
      proteinGPerServing: d.p,
      carbohydratesGPerServing: d.c,
      fatGPerServing: d.f,
      calories: d.cal,
      proteinG: d.p,
      carbohydratesG: d.c,
      fatG: d.f,
      provider: "mock",
    },
  });
}
console.info(`Seeded ${demo.length} demo entries for ${config.demoUserId}.`);
await prisma.$disconnect();
