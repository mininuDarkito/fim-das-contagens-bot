// src/commands/registrargrupo.js
import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import prisma from "../../prisma/client.js";

export default {
  data: new SlashCommandBuilder()
    .setName("registrargrupo")
    .setDescription("Registra este canal como um grupo de vendas.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(opt => opt.setName("nome").setDescription("Nome do grupo").setRequired(true)),

  async execute(interaction) {
    const nome = interaction.options.getString("nome");
    const channelId = interaction.channelId; // Pega o ID do canal atual

    await interaction.deferReply({ ephemeral: true });

    try {
      // 1. Busca o seu usuário (Dono do grupo)
      const dono = await prisma.user.findUnique({ where: { discord_id: interaction.user.id } });
      if (!dono) return interaction.editReply("❌ Você precisa estar logado no site primeiro.");

      // 2. Registra o grupo no banco
      const grupo = await prisma.grupo.upsert({
        where: { channel_id: channelId },
        update: { nome: nome },
        create: {
          channel_id: channelId,
          nome: nome,
          user_id: dono.id // Conecta ao seu ID único
        }
      });

      interaction.editReply(`✅ Grupo **${grupo.nome}** (ID: ${grupo.channel_id}) registrado com sucesso!`);
    } catch (e) {
      console.error(e);
      interaction.editReply("❌ Erro ao registrar grupo. Verifique se a coluna 'channel_id' existe no banco.");
    }
  }
};