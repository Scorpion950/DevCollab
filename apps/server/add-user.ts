import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = 'yagaikwad12345@gmail.com';
  const password = 'India@95';
  
  const existingUser = await prisma.user.findUnique({ where: { email } });
  
  if (existingUser) {
    console.log('User already exists!');
    return;
  }
  
  const salt = await bcrypt.genSalt(10);
  const passwordHash = await bcrypt.hash(password, salt);
  
  const user = await prisma.user.create({
    data: {
      name: 'Yagaikwad',
      email: email,
      passwordHash: passwordHash,
      emailVerified: true
    }
  });
  
  console.log('Successfully created user:', user.email);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
