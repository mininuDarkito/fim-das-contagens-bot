export async function autocompleteProdutos(prisma, interaction) {
  const focused = interaction.options.getFocused().toLowerCase();

  try {
    // 1. Buscamos o grupo e trazemos as séries vinculadas a ele + os dados do produto
    const grupo = await prisma.grupo.findUnique({
      where: { channel_id: interaction.channelId }, // Corrigido de channelId para channel_id
      include: { 
        user_series: {
          include: {
            produto: true // Traz os detalhes do produto (nome, plataforma, etc)
          }
        } 
      }
    });

    if (!grupo || !grupo.user_series) {
      return interaction.respond([]);
    }

    // 2. Filtramos em cima da tabela user_series
    const filtrados = grupo.user_series
      .filter(serie => {
        const p = serie.produto;
        return (
          p.nome.toLowerCase().includes(focused) || 
          p.plataforma?.toLowerCase().includes(focused) ||
          p.nome_alternativo?.toLowerCase().includes(focused)
        );
      })
      .sort((a, b) => a.produto.nome.localeCompare(b.produto.nome))
      .slice(0, 25)
      .map(serie => ({
        // Exibimos: Plataforma • Nome (ou Alt) — R$ Valor
        name: `${serie.produto.plataforma} • ${serie.produto.nome} — R$ ${Number(serie.preco).toFixed(2)}`,
        value: serie.produto.nome
      }));

    await interaction.respond(filtrados);
  } catch (error) {
    console.error("Erro no autocomplete:", error);
    await interaction.respond([]);
  }
}