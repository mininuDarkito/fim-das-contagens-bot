// src/commands/registrarproduto.js
import { SlashCommandBuilder } from "discord.js";
import prisma from "../../prisma/client.js";

export default {
  data: new SlashCommandBuilder()
    .setName("registrarproduto")
    .setDescription("Registra um produto neste grupo.")
    .addStringOption(o => o.setName("plataforma").setDescription("Ex: Kakao, Ridi").setRequired(true))
    .addStringOption(o => o.setName("nome").setDescription("Nome da Raw/Série").setRequired(true))
    .addNumberOption(o => o.setName("valor").setDescription("Valor da venda (ex: 0.80)").setRequired(true))
    .addStringOption(o => o.setName("capa").setDescription("URL da imagem da capa").setRequired(false))
    .addStringOption(o => o.setName("alternativo").setDescription("Nome alternativo/secundário").setRequired(false)),

  async execute(interaction) {
    const plataforma = interaction.options.getString("plataforma");
    const nome = interaction.options.getString("nome");
    const valor = interaction.options.getNumber("valor");
    const capa = interaction.options.getString("capa");
    const nomeAlternativo = interaction.options.getString("alternativo");
    const channelId = interaction.channelId;

    await interaction.deferReply({ ephemeral: true });

    try {
      const grupo = await prisma.grupo.findUnique({ where: { channel_id: channelId } });
      if (!grupo) return interaction.editReply("❌ Grupo não registrado. Use /registrargrupo.");

      // Atualiza ou Cria o produto com os novos campos
      const produto = await prisma.produto.upsert({
        where: { nome: nome },
        update: { 
          plataforma: plataforma,
          imagem_url: capa, // Mapeado para imagem_url do banco
          nome_alternativo: nomeAlternativo 
        },
        create: { 
          nome: nome, 
          plataforma: plataforma,
          imagem_url: capa,
          nome_alternativo: nomeAlternativo
        }
      });

      // Vincula ao grupo (user_series)
      await prisma.userSerie.upsert({
        where: {
          unique_user_produto: {
            user_id: grupo.user_id,
            produto_id: produto.id
          }
        },
        update: { preco: valor, grupo_id: grupo.id },
        create: {
          user_id: grupo.user_id,
          produto_id: produto.id,
          grupo_id: grupo.id,
          preco: valor
        }
      });

      let response = `✅ Produto **${nome}** registrado!`;
      if (nomeAlternativo) response += `\n📝 Nome Alt: *${nomeAlternativo}*`;
      if (capa) response += `\n🖼️ Capa vinculada com sucesso.`;

      interaction.editReply(response);
    } catch (e) {
      console.error(e);
      interaction.editReply("❌ Erro ao registrar produto. Verifique os logs.");
    }
  }
};