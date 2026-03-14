import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import prisma from "../../prisma/client.js";

export default {
  data: new SlashCommandBuilder()
    .setName("darperm")
    .setDescription("Concede permissões administrativas no site para um usuário.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) // Apenas ADMs do Discord podem usar
    .addUserOption(option =>
      option.setName("usuario")
        .setDescription("O usuário que receberá a permissão.")
        .setRequired(true)
    )
    .addStringOption(option =>
      option.setName("cargo")
        .setDescription("O cargo a ser atribuído (admin ou user).")
        .setRequired(true)
        .addChoices(
          { name: 'Administrador', value: 'admin' },
          { name: 'Usuário Comum', value: 'user' }
        )
    ),

  async execute(interaction) {
    const alvo = interaction.options.getUser("usuario");
    const cargo = interaction.options.getString("cargo");

    await interaction.deferReply({ ephemeral: true });

    try {
      // 1. Verifica se o usuário já existe no banco (já fez login no site)
      const usuarioNoBanco = await prisma.user.findUnique({
        where: { discord_id: alvo.id }
      });

      if (!usuarioNoBanco) {
        return interaction.editReply(`❌ O usuário **${alvo.username}** ainda não está no banco. Peça para ele entrar no site pelo menos uma vez.`);
      }

      // 2. Atualiza o cargo
      await prisma.user.update({
        where: { discord_id: alvo.id },
        data: { role: cargo }
      });

      // 3. Log de Atividade (Importante para segurança)
      await prisma.activityLog.create({
        data: {
          user_id: usuarioNoBanco.id,
          action: 'ROLE_UPDATE',
          entity_type: 'USER',
          entity_id: usuarioNoBanco.id,
          details: { 
            novo_cargo: cargo, 
            quem_deu: interaction.user.username,
            motivo: "Comando /darperm no Discord"
          }
        }
      });

      await interaction.editReply(`✅ O cargo de **${alvo.username}** no site foi alterado para **${cargo}**!`);

    } catch (error) {
      console.error("Erro ao dar permissão:", error);
      await interaction.editReply("❌ Erro técnico ao acessar o PostgreSQL.");
    }
  }
};