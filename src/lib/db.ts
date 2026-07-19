import "dotenv/config";
import { PrismaClient } from "@prisma/client";

declare global {
  var prisma: PrismaClient | undefined;
}

function createPrismaClient() {
  return new PrismaClient();
}

export const db = global.prisma || createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.prisma = db;
}
