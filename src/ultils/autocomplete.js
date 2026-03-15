export async function autocompleteProdutos(prisma, interaction) {
  if (interaction.responded) return;

  try {
    const focused = interaction.options.getFocused().toLowerCase();

    // Busca rápida no banco
    const grupo = await prisma.grupo.findUnique({
      where: { channel_id: interaction.channelId },
      include: { 
        user_series: { include: { produto: true } } 
      }
    });

    if (!grupo || !grupo.user_series || grupo.user_series.length === 0) {
      return await interaction.respond([]);
    }

    const filtrados = grupo.user_series
      .filter(serie => {
        const p = serie.produto;
        return (
          p.nome.toLowerCase().includes(focused) || 
          p.plataforma?.toLowerCase().includes(focused) ||
          p.nome_alternativo?.toLowerCase().includes(focused)
        );
      })
      .slice(0, 25)
      .map(serie => ({
        name: `${serie.produto.plataforma} • ${serie.produto.nome} — R$ ${Number(serie.preco).toFixed(2)}`,
        value: serie.produto.nome
      }));

    if (!interaction.responded) {
      await interaction.respond(filtrados);
    }

  } catch (error) {
    // Silencia o erro 10062 (Unknown Interaction) que ocorre se o user fechar o menu rápido
    if (error.code === 10062 || error.code === 40060) return;
    
    console.error("Erro no autocomplete:", error);
    try {
      if (!interaction.responded) await interaction.respond([]);
    } catch (e) {}
  }
}