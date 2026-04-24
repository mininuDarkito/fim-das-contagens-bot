import { SlashCommandBuilder, EmbedBuilder, MessageFlags } from "discord.js";
import prisma from "../../prisma/client.js";

export default {
  data: new SlashCommandBuilder()
    .setName("listarprodutos")
    .setDescription("Lista as obras ativas neste Grupo Global e seus preços."),

  async execute(interaction) {
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    try {
      // 1. Busca o Grupo e traz os preços globais (grupo_series) e vínculos
      const grupo = await prisma.grupo.findUnique({
        where: { channel_id: interaction.channelId },
        include: {
          grupo_series: {
            include: {
              produtos: true
            }
          }
        }
      });

      if (!grupo) {
        return interaction.editReply("❌ Este canal não está registrado como um Grupo Global.");
      }

      const seriesAtivas = grupo.grupo_series || [];

      if (seriesAtivas.length === 0) {
        return interaction.editReply("📭 Nenhuma obra foi ativada para este grupo global ainda.");
      }

      // 2. Formatação da Lista (Ordenada por Nome)
      const listaFormatada = seriesAtivas
        .filter(gs => gs.produtos) // Segurança contra produtos deletados
        .sort((a, b) => a.produtos.nome.localeCompare(b.produtos.nome))
        .map(gs => {
          const p = gs.produtos;
          const preco = Number(gs.preco).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
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