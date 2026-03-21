export async function autocompleteProdutos(prisma, interaction) {
  if (interaction.responded) return;

  try {
    const focused = interaction.options.getFocused() || "";

    // MUDANÇA: Busca direto no Catálogo Global de Produtos, ignorando se está vinculado ou não
    const produtos = await prisma.produto.findMany({
      where: focused ? {
        OR: [
          { nome: { contains: focused, mode: 'insensitive' } },
          { plataforma: { contains: focused, mode: 'insensitive' } },
          { nome_alternativo: { contains: focused, mode: 'insensitive' } }
        ]
      } : undefined,
      take: 25,
      orderBy: { nome: 'asc' }
    });

    const filtrados = produtos.map(p => {
      const plat = p.plataforma ? `[${p.plataforma}]` : '[GLOBAL]';
      return {
        // Discord tem limite de 100 caracteres no nome do autocomplete
        name: `${plat} ${p.nome}`.substring(0, 100),
        value: p.nome.substring(0, 100)
      };
    });

    if (!interaction.responded) {
      await interaction.respond(filtrados);
    }

  } catch (error) {
    // Silencia o erro 10062 (Unknown Interaction)
    if (error.code === 10062 || error.code === 40060) return;
    
    console.error("Erro no autocomplete:", error);
    try {
      if (!interaction.responded) await interaction.respond([]);
    } catch (e) {}
  }
}