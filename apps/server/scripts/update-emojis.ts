import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PROFESSIONAL_SYMBOLS = [
  '✦', '❖', '✧', '⌘', '⌥', '⇧', '⚡', '★', '☻', '△',
  '◇', '○', '□', '⟡', '⚲', '◓', '◑', '◒', '◕', '●',
];

async function main() {
  const projects = await prisma.project.findMany();
  let updatedCount = 0;
  
  for (const project of projects) {
    if (project.emoji && !PROFESSIONAL_SYMBOLS.includes(project.emoji)) {
      // It's an old emoji, let's assign a professional symbol deterministically based on name length or random
      const newSymbol = PROFESSIONAL_SYMBOLS[project.name.length % PROFESSIONAL_SYMBOLS.length];
      await prisma.project.update({
        where: { id: project.id },
        data: { emoji: newSymbol },
      });
      updatedCount++;
    }
  }
  
  console.log(`Successfully updated ${updatedCount} existing projects with professional symbols.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
