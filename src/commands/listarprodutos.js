import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import prisma from "../../prisma/client.js";

export default {
  data: new SlashCommandBuilder()
    .setName("listarprodutos")
    .setDescription("Lista as obras ativas neste Grupo Global e seus preços."),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      // 1. Busca o Grupo pelo Canal e traz as séries vinculadas ao Admin desse grupo
      const grupo = await prisma.grupo.findUnique({
        where: { channel_id: interaction.channelId },
        include: {
          // Nota: Certifique-se se no seu schema é 'user_series' ou 'userSeries'
          // Baseado na sua última correção, manteremos 'user_series'
          user_series: {
            where: { ativo: true },
            include: {
              produto: true
            }
          }
        }
      });

      if (!grupo) {
        return interaction.editReply("❌ Este canal não está registrado como um Grupo Global.");
      }

      const seriesAtivas = grupo.user_series || [];

      if (seriesAtivas.length === 0) {
        return interaction.editReply("📭 Nenhuma obra foi ativada para este grupo global ainda.");
      }

      // 2. Formatação da Lista (Ordenada por Nome)
      const listaFormatada = seriesAtivas
        .filter(us => us.produto) // Segurança contra produtos deletados
        .sort((a, b) => a.produto.nome.localeCompare(b.produto.nome))
        .map(us => {
          const p = us.produto;
          const preco = Number(us.preco).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
          const plat = p.plataforma ? `[${p.plataforma.toUpperCase()}]` : "";
          
          return `**${p.nome}**\n└ 🏷️ ${plat} — **${preco}**`;
        });

      // 3. Montagem do Embed
      const embed = new EmbedBuilder()
        .setTitle(`📦 Catálogo: ${grupo.nome}`)
        .setColor("#5865F2") // Blurple do Discord
        .setThumbnail(interaction.guild.iconURL())
        .setFooter({ text: `${listaFormatada.length} obras ativas no canal` })
        .setTimestamp();

      // Divisão de descrição para evitar o limite de 4096 caracteres do Discord
      const descricaoTotal = listaFormatada.join("\n\n");
      
      if (descricaoTotal.length > 4000) {
        embed.setDescription(descricaoTotal.substring(0, 3990) + "\n*...e mais obras.*");
      } else {
        embed.setDescription(descricaoTotal);
      }

      return interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error("❌ Erro ao listar produtos:", error);
      return interaction.editReply(`❌ Erro técnico: ${error.message}`);
    }
  }
};