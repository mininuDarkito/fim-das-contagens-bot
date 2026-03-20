import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from "discord.js";
import prisma from "../../prisma/client.js";

export default {
  data: new SlashCommandBuilder()
    .setName("registrarproduto")
    .setDescription("ADMIN: Registra ou vincula uma obra a este grupo global.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(o => o.setName("plataforma").setDescription("Ex: Kakao, Ridi, Lezhin").setRequired(true))
    .addStringOption(o => o.setName("nome").setDescription("Nome da Obra/Série").setRequired(true))
    .addNumberOption(o => o.setName("valor").setDescription("Preço por capítulo (Ex: 0.80)").setRequired(true))
    .addStringOption(o => o.setName("capa").setDescription("URL da imagem da capa").setRequired(false))
    .addStringOption(o => o.setName("alternativo").setDescription("Nome alternativo").setRequired(false)),

  async execute(interaction) {
    const plataforma = interaction.options.getString("plataforma");
    const nome = interaction.options.getString("nome");
    const valor = interaction.options.getNumber("valor");
    const capa = interaction.options.getString("capa");
    const nomeAlternativo = interaction.options.getString("alternativo");
    const channelId = interaction.channelId;

    await interaction.deferReply({ ephemeral: true });

    try {
      // 1. Validação de Role e Identificação do Admin
      const admin = await prisma.user.findUnique({
        where: { discord_id: interaction.user.id }
      });

      if (!admin || admin.role !== 'admin') {
        return interaction.editReply("❌ **Acesso Negado:** Apenas administradores cadastrados podem gerenciar o catálogo global.");
      }

      // 2. Identifica o Grupo Global deste canal
      const grupo = await prisma.grupo.findUnique({ 
        where: { channel_id: channelId } 
      });

      if (!grupo) {
        return interaction.editReply("❌ Este canal não está registrado como um **Grupo Global**. Use `/registrargrupo` primeiro.");
      }

      // 3. Upsert na tabela global de PRODUTOS
      const produto = await prisma.produto.upsert({
        where: { nome: nome },
        update: { 
          plataforma: plataforma,
          imagem_url: capa || undefined,
          nome_alternativo: nomeAlternativo || undefined,
          updated_at: new Date()
        },
        create: { 
          nome: nome, 
          plataforma: plataforma,
          imagem_url: capa,
          nome_alternativo: nomeAlternativo
        }
      });

      // 4. Upsert na tabela de VÍNCULOS (UserSeries)
      // Ajustado para a nova constraint: user_id + produto_id + grupo_id
      await prisma.userSeries.upsert({
        where: {
          unique_user_produto_grupo: {
            user_id: admin.id,
            produto_id: produto.id,
            grupo_id: grupo.id
          }
        },
        update: { 
          preco: valor, 
          ativo: true,
          updated_at: new Date()
        },
        create: {
          user_id: admin.id,
          produto_id: produto.id,
          grupo_id: grupo.id,
          preco: valor,
          ativo: true
        }
      });

      // 5. Log de Auditoria
      await prisma.activityLog.create({
        data: {
          user_id: admin.id,
          action: "admin_register_product",
          entity_type: "produto",
          entity_id: produto.id,
          details: { 
            obra: nome, 
            preco: valor, 
            grupo: grupo.nome 
          }
        }
      });

      // 6. Resposta Visual Nexus Style
      const embed = new EmbedBuilder()
        .setTitle("📖 Obra Mapeada com Sucesso")
        .setColor("#00BFFF")
        .setThumbnail(capa || null)
        .addFields(
          { name: "🏷️ Nome", value: `**${nome}**`, inline: true },
          { name: "💰 Preço/Cap", value: `R$ ${valor.toFixed(2)}`, inline: true },
          { name: "📍 Grupo", value: grupo.nome, inline: true },
          { name: "📱 Origem", value: plataforma, inline: true }
        )
        .setFooter({ text: "Yakuza Raws • Gestão de Catálogo" })
        .setTimestamp();

      if (nomeAlternativo) {
        embed.addFields({ name: "📝 Nome Alt.", value: `*${nomeAlternativo}*`, inline: false });
      }

      return interaction.editReply({ embeds: [embed] });

    } catch (e) {
      console.error("❌ Erro ao registrar produto manual:", e);
      return interaction.editReply(`❌ **Erro no Banco:** ${e.message}`);
    }
  }
};