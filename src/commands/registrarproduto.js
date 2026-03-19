import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import prisma from "../../prisma/client.js";

export default {
  data: new SlashCommandBuilder()
    .setName("registrarproduto")
    .setDescription("ADMIN: Registra manualmente uma obra neste grupo global.")
    // Apenas Admins podem definir preços e produtos no grupo global
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
      // 1. Identifica o Grupo Global vinculado a este canal
      const grupo = await prisma.grupo.findUnique({ 
        where: { channel_id: channelId } 
      });

      if (!grupo) {
        return interaction.editReply("❌ Este canal não é um Grupo Global registrado. Use `/registrargrupo` primeiro.");
      }

      // 2. Atualiza ou Cria o produto na tabela global de obras
      const produto = await prisma.produto.upsert({
        where: { nome: nome },
        update: { 
          plataforma: plataforma,
          imagem_url: capa || undefined,
          nome_alternativo: nomeAlternativo || undefined
        },
        create: { 
          nome: nome, 
          plataforma: plataforma,
          imagem_url: capa,
          nome_alternativo: nomeAlternativo
        }
      });

      // 3. Vincula a Obra ao Grupo (Tabela UserSerie)
      // Usamos o user_id do DONO do grupo (Admin) para que a configuração seja válida para o canal todo
      await prisma.userSerie.upsert({
        where: {
          unique_user_produto: {
            user_id: grupo.user_id, // Atribui ao Admin dono do grupo
            produto_id: produto.id
          }
        },
        update: { 
          preco: valor, 
          grupo_id: grupo.id,
          ativo: true 
        },
        create: {
          user_id: grupo.user_id,
          produto_id: produto.id,
          grupo_id: grupo.id,
          preco: valor,
          ativo: true
        }
      });

      // 4. Resposta formatada
      let response = `✅ **Obra Registrada Manualmente!**\n`;
      response += `📖 **Nome:** ${nome}\n`;
      response += `💰 **Preço Unitário:** R$ ${valor.toFixed(2)}\n`;
      response += `📍 **Grupo:** ${grupo.nome}`;
      
      if (nomeAlternativo) response += `\n📝 **Nome Alt:** *${nomeAlternativo}*`;

      return interaction.editReply(response);

    } catch (e) {
      console.error("❌ Erro ao registrar produto manual:", e);
      return interaction.editReply("❌ Erro técnico ao registrar produto. Verifique se o seu usuário está cadastrado no site.");
    }
  }
};