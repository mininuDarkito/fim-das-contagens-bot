import { PrismaClient } from '@prisma/client';

// Criamos uma única instância do PrismaClient
const prisma = new PrismaClient({
  log: ['error', 'warn'], // Mostra erros e avisos no console para te ajudar no debug
});

// Exportamos para usar nos comandos (ex: import prisma from './client.js')
export default prisma;

// Tratamento para fechar a conexão graciosamente se o bot for desligado
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});