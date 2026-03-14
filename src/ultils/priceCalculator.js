export async function calcularValorFinal(prisma, produto) {
  // 1) Se o produto tem valor próprio → usar
  if (produto.valor !== null && produto.valor !== undefined) {
    return produto.valor;
  }

  // 2) Buscar valor global da plataforma
  const plataforma = await prisma.plataformaGlobal.findUnique({
    where: { nome: produto.plataforma }
  });

  return plataforma?.valor ?? 0;
}
