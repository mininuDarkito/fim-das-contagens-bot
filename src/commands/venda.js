import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } from "discord.js";
import prisma from "../../prisma/client.js";
import { autocompleteProdutos } from "../ultils/autocomplete.js"; // Ajuste o caminho se necessário

export default {
  data: new SlashCommandBuilder()
    .setName("venda")
    .setDescription("Registra a venda de capítulos/unidades neste grupo.")
    .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages)
    .addStringOption(o =>
      o.setName("produto")
        .setDescription("Obra vendida (Acervo Global).")
        .setAutocomplete(true)
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("numero")
        .setDescription("Número ou intervalo (ex: 5 ou 5-10)")
        .setRequired(true)
    ),

  async autocomplete(interaction) {
    await autocompleteProdutos(prisma, interaction);
  },

  async execute(interaction) {
    const produtoNome = interaction.options.getString("produto");
    const numeroInput = interaction.options.getString("numero");
    const discordUserId = interaction.user.id;

    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    try {
      // 1. Identifica o Vendedor
      const vendedor = await prisma.user.findUnique({
        where: { discord_id: discordUserId }
      });

      if (!vendedor) {
        return interaction.editReply("❌ **Usuário não encontrado:** Acesse o dashboard do site e vincule sua conta Discord primeiro.");
      }

      // 2. Identifica o Grupo Global
      const grupo = await prisma.grupo.findUnique({
        where: { channel_id: interaction.channelId }
      });

      if (!grupo) {
        return interaction.editReply("❌ **Canal não mapeado:** Este canal não está registrado como um Grupo de vendas.");
      }

      // 3. BUSCA A OBRA NO ACERVO GLOBAL
      const obraGlobal = await prisma.produto.findUnique({
        where: { nome: produtoNome }
      });

      if (!obraGlobal) {
        return interaction.editReply(`❌ **Obra não encontrada:** "${produtoNome}" não existe no acervo global da Yakuza.`);
      }

      // 4. Busca a configuração de preço (se o usuário vinculou no painel)
      const configuracao = await prisma.userSeries.findFirst({
        where: { 
          grupo_id: grupo.id,
          produto_id: obraGlobal.id,
          OR: [
            { user_id: vendedor.id },
            { user_id: grupo.user_id }
          ],
          ativo: true
        },
        orderBy: { user_id: 'asc' }
      });

      // MUDANÇA: Se não tem configuração, permite vender mas zera o preço.
      const precoUnit = configuracao ? Number(configuracao.preco) : 0;
      const isVinculado = !!configuracao;

      // --- Lógica de Processamento de Capítulos ---
      let numeros = [];
      if (numeroInput.includes("-")) {
        const [inicio, fim] = numeroInput.split("-").map(n => parseInt(n.trim()));
        if (isNaN(inicio) || isNaN(fim) || fim < inicio) return interaction.editReply("❌ **Erro:** Intervalo de capítulos inválido.");
        for (let i = inicio; i <= fim; i++) numeros.push(i);
      } else {
        const n = parseInt(numeroInput.trim());
        if (isNaN(n)) return interaction.editReply("❌ **Erro:** Número do capítulo inválido.");
        numeros.push(n);
      }

      // 5. Verificação de Duplicidade (Neste grupo)
      const existentes = await prisma.venda.findMany({
        where: { 
          grupo_id: grupo.id, 
          produto_id: obraGlobal.id, 
          quantidade: { in: numeros } 
        },
        select: { quantidade: true }
      });

      const jaVendidos = existentes.map(v => v.quantidade);
      const paraCriar = numeros.filter(n => !jaVendidos.includes(n));

      // 6. Registro das Vendas em Transação
      if (paraCriar.length > 0) {
        await prisma.$transaction(
          paraCriar.map(n => prisma.venda.create({
            data: {
              user_id: vendedor.id,
              produto_id: obraGlobal.id, // Usa o ID direto da obra global
              grupo_id: grupo.id,
              quantidade: n,
              preco_unitario: precoUnit,
              preco_total: precoUnit,
              data_venda: new Date(),
              observacoes: `Via bot: ${interaction.user.username}${!isVinculado ? ' (Série não vinculada)' : ''}`
            }
          }))
        );

        // Registro de Log Global
        await prisma.activityLog.create({
          data: {
            user_id: vendedor.id,
            action: "venda_bot_lote",
            entity_type: "venda",
            details: { obra: obraGlobal.nome, caps: paraCriar, grupo: grupo.nome, is_vinculado: isVinculado }
          }
        });
      }

      // --- Resposta Visual (Embed) ---
      const totalFaturado = paraCriar.length * precoUnit;
      const embed = new EmbedBuilder()
        .setAuthor({ name: "Yakuza Raws System", iconURL: interaction.user.displayAvatarURL() })
        .setTitle(paraCriar.length > 0 ? "✅ Venda Registrada" : "⚠️ Registro Duplicado")
        .setColor(paraCriar.length > 0 ? "#2ecc71" : "#f1c40f")
        .setThumbnail(obraGlobal.imagem_url || null)
        .setFooter({ text: `Vendedor: ${vendedor.discord_username}` })
        .setTimestamp();

      // Aviso inteligente caso a pessoa venda algo que não configurou no site
      let descricao = `**Série:** ${obraGlobal.nome}\n**Grupo:** ${grupo.nome}`;
      if (!isVinculado && paraCriar.length > 0) {
        descricao += `\n\n⚠️ **Aviso:** Esta obra não foi vinculada no seu painel para este grupo. O preço foi registrado como \`R$ 0,00\`. Você pode ajustar isso no Dashboard depois.`;
      }
      embed.setDescription(descricao);

      if (paraCriar.length > 0) {
        embed.addFields(
          { name: "💰 Faturamento", value: `R$ ${totalFaturado.toFixed(2)}`, inline: true },
          { name: "📖 Capítulos", value: `\`${paraCriar.join(", ")}\``, inline: true }
        );
      }

      if (jaVendidos.length > 0) {
        embed.addFields({ name: "🚫 Já registrados neste grupo", value: `\`${jaVendidos.join(", ")}\`` });
      }

      return interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error("Erro no comando de venda:", error);
      return interaction.editReply(`❌ **Erro técnico:** Não foi possível processar a venda no banco de dados.`);
    }
  }
};