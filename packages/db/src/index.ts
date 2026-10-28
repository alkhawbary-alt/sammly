import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './generated/client';

export * from './generated/client';

let client: PrismaClient | undefined;

/** Process-wide Prisma client (driver adapter on `pg`). */
export function db(): PrismaClient {
  if (!client) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error('DATABASE_URL is not set');
    client = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
  }
  return client;
}

export async function disconnectDb(): Promise<void> {
  await client?.$disconnect();
  client = undefined;
}
