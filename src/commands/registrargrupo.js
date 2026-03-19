import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import prisma from "../../prisma/client.js";

export default {
  data: new SlashCommandBuilder()
    .setName("registrargrupo")
    .setDescription("ADMIN: Registra este canal como um Grupo Global de vendas.")
    // Garante que apenas quem tem permissão de Administrador no servidor veja o comando
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(opt => 
      opt.setName("nome")
        .setDescription("Nome identificador do grupo (Ex: Solo Leveling - Oficial)")
        .setRequired(true)
    ),

  async execute(interaction) {
    const nome = interaction.options.getString("nome");
    const channelId = interaction.channelId;

    await interaction.deferReply({ ephemeral: true });

    try {
      // 1. Validação de conta do Admin no banco
      const admin = await prisma.user.findUnique({ 
        where: { discord_id: interaction.user.id } 
      });

      if (!admin) {
        return interaction.editReply("❌ Erro: Seu usuário de administrador não foi encontrado no banco de dados do site.");
      }

      // 2. Registro ou Atualização do Grupo Global
      // O channel_id é @unique, então o upsert garante que cada canal seja apenas UM grupo.
      const grupo = await prisma.grupo.upsert({
        where: { channel_id: channelId },
        update: { 
          nome: nome,
          // Opcional: atualizar quem foi o último admin a mexer no grupo
          user_id: admin.id 
        },
        create: {
          channel_id: channelId,
          nome: nome,
          user_id: admin.id // Vincula você como o criador do mapeamento
        }
      });

      // 3. Resposta de sucesso
      return interaction.editReply({
        content: `✅ **Grupo Global Registrado!**\n\n` +
                 `• **Nome:** ${grupo.nome}\n` +
                 `• **Canal ID:** \`${grupo.channel_id}\`\n` +
                 `• **Status:** Ativo para vendas individuais.\n\n` +
                 `*Agora qualquer usuário cadastrado pode usar /venda neste canal.*`
      });

    } catch (error) {
      console.error("❌ Erro no registrargrupo:", error);
      
      // Tratamento de erro específico para colunas faltantes ou restrições de banco
      if (error.code === 'P2002') {
        return interaction.editReply("❌ Erro: Este canal já está vinculado a outro grupo.");
      }

      return interaction.editReply(`❌ Erro técnico ao registrar grupo: ${error.message}`);
    }
  }
};