import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import prisma from "../../prisma/client.js";

export default {
  data: new SlashCommandBuilder()
    .setName("listarprodutos")
    .setDescription("Lista as obras registradas neste grupo com seus respectivos preços."),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      // Alterado de userSeries para user_series conforme sugerido pelo erro do Prisma
      const grupo = await prisma.grupo.findUnique({
        where: { channel_id: interaction.channelId },
        include: {
          user_series: {
            where: { ativo: true },
            include: {
              produto: true
            }
          }
        }
      });

      if (!grupo) {
        return interaction.editReply("❌ Este canal não está vinculado a um grupo registrado.");
      }

      // Ajustado o acesso ao campo aqui também para user_series
      if (!grupo.user_series || grupo.user_series.length === 0) {
        return interaction.editReply("📭 Nenhuma obra foi registrada para este grupo ainda.");
      }

      const embed = new EmbedBuilder()
        .setTitle(`📦 Obras de ${grupo.nome || "Este Grupo"}`)
        .setColor(0x2F3136)
        .setTimestamp();

      const lista = grupo.user_series.map(us => {
        const p = us.produto;
        // Se p for null (por algum erro de integridade), evitamos crash
        if (!p) return null;

        const precoFormatado = us.preco.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        return `• **${p.nome}**\n   └ 🏷️ \`${p.plataforma.toUpperCase()}\` — **${precoFormatado}**`;
      }).filter(item => item !== null);

      const descricao = lista.join("\n\n");

      if (descricao.length === 0) {
        return interaction.editReply("📭 Nenhuma obra ativa encontrada.");
      }

      embed.setDescription(descricao.length > 4096 ? descricao.substring(0, 4090) + "..." : descricao);

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error("Erro ao listar produtos:", error);
      await interaction.editReply("❌ Ocorreu um erro ao consultar o banco de dados.");
    }
  }
};