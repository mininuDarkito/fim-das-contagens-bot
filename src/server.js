import Fastify from 'fastify';
import { PrismaClient } from '@prisma/client';

const fastify = Fastify({ logger: true });
const prisma = new PrismaClient();

// --- ROTAS DE GRUPOS ---

// Criar um Grupo
fastify.post('/grupos', async (request, reply) => {
  const { channelId, nome } = request.body;
  const grupo = await prisma.grupo.create({
    data: { channelId, nome }
  });
  return grupo;
});

// Listar todos os Grupos com seus produtos
fastify.get('/grupos', async () => {
  return await prisma.grupo.findMany({
    include: { produtos: true }
  });
});

// --- ROTAS DE PRODUTOS ---

// Criar um Produto vinculado a um Grupo
fastify.post('/produtos', async (request, reply) => {
  const { name, platform, valor, grupoId } = request.body;
  const produto = await prisma.produto.create({
    data: {
      name,
      platform,
      valor,
      grupoId: grupoId ? parseInt(grupoId) : null
    }
  });
  return produto;
});

// Listar Produtos por Grupo
fastify.get('/grupos/:id/produtos', async (request) => {
  const { id } = request.params;
  return await prisma.produto.findMany({
    where: { grupoId: parseInt(id) }
  });
});

// --- ROTAS DE VENDAS ---

// Registrar uma Venda
fastify.post('/vendas', async (request, reply) => {
  const { buyer, buyerName, numero, produtoId, grupoId } = request.body;
  
  try {
    const venda = await prisma.venda.create({
      data: {
        buyer,
        buyerName,
        numero: parseInt(numero),
        produtoId: parseInt(produtoId),
        grupoId: parseInt(grupoId)
      },
      include: {
        produto: true,
        group: true
      }
    });
    return venda;
  } catch (error) {
    reply.status(400).send({ error: "Erro ao registrar venda. Verifique os IDs." });
  }
});

// Relatório de Vendas por Grupo
fastify.get('/grupos/:id/vendas', async (request) => {
  const { id } = request.params;
  return await prisma.venda.findMany({
    where: { grupoId: parseInt(id) },
    include: { produto: true }
  });
});

// --- INICIALIZAÇÃO DO SERVIDOR ---

const start = async () => {
  try {
    await fastify.listen({ port: 3000 });
    console.log("🚀 Server running at http://localhost:3000");
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();