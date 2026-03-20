import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from "discord.js";
import prisma from "../../prisma/client.js";

export default {
  data: new SlashCommandBuilder()
    .setName("registrargrupo")
    .setDescription("ADMIN: Registra este canal como um Grupo Global de vendas.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(opt => 
      opt.setName("nome")
        .setDescription("Nome identificador do grupo (Ex: Luna Toons - Oficial)")
        .setRequired(true)
    ),

  async execute(interaction) {
    const nome = interaction.options.getString("nome");
    const channelId = interaction.channelId;

    await interaction.deferReply({ ephemeral: true });

    try {
      // 1. Validação do Admin no Banco (Verifica existência e role)
      const admin = await prisma.user.findUnique({ 
        where: { discord_id: interaction.user.id } 
      });

      if (!admin) {
        return interaction.editReply("❌ **Erro de Acesso:** Seu usuário não foi encontrado no banco de dados. Cadastre-se no site primeiro.");
      }

      if (admin.role !== 'admin') {
        return interaction.editReply("❌ **Permissão Negada:** Apenas usuários com role 'admin' no banco de dados podem registrar grupos globais.");
      }

      // 2. Registro ou Atualização (Upsert) do Grupo Global
      const grupo = await prisma.grupo.upsert({
        where: { channel_id: channelId },
        update: { 
          nome: nome,
          updated_at: new Date()
        },
        create: {
          channel_id: channelId,
          nome: nome,
          user_id: admin.id, // O admin que registrou se torna o 'owner' do grupo no banco
        }
      });

      // 3. Registrar no Log de Atividades
      await prisma.activityLog.create({
        data: {
          user_id: admin.id,
          action: "register_global_group",
          entity_type: "grupo",
          entity_id: grupo.id,
          details: { channel_id: channelId, group_name: nome }
        }
      });

      // 4. Resposta visual elegante com Embed
      const embed = new EmbedBuilder()
        .setTitle("✅ Grupo Global Configurado")
        .setColor("#00FF7F") // Verde Primavera (Nexus Style)
        .setDescription(`Este canal foi mapeado com sucesso no sistema global.`)
        .addFields(
          { name: "🏷️ Identificador", value: `**${grupo.nome}**`, inline: true },
          { name: "🆔 Channel ID", value: `\`${grupo.channel_id}\``, inline: true },
          { name: "🛡️ Registrado por", value: `${interaction.user.username}`, inline: false }
        )
        .setFooter({ text: "Yakuza Raws v3.0 • Sistema de Grupos Globais" })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error("❌ Erro no registrargrupo:", error);
      
      if (error.code === 'P2002') {
        return interaction.editReply("❌ **Erro de Conflito:** Este canal já está registrado sob outro nome no sistema.");
      }

      return interaction.editReply(`❌ **Erro Interno:** Não foi possível salvar no banco. Verifique os logs do bot.`);
    }
  }
};