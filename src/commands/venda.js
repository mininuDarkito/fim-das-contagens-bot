import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } from "discord.js";
import prisma from "../../prisma/client.js";
import { autocompleteProdutos } from "../ultils/autocomplete.js";

export default {
  data: new SlashCommandBuilder()
    .setName("venda")
    .setDescription("Registra a venda de capítulos/unidades neste grupo.")
    .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages)
    .addStringOption(o =>
      o.setName("produto")
        .setDescription("Obra vendida.")
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
      // 1. Identifica o Vendedor no banco de dados
      const vendedor = await prisma.user.findUnique({
        where: { discord_id: discordUserId }
      });

      if (!vendedor) {
        return interaction.editReply("❌ **Usuário não encontrado:** Acesse o dashboard do site e vincule sua conta Discord primeiro.");
      }

      // 2. Identifica o Grupo Global deste canal
      const grupo = await prisma.grupo.findUnique({
        where: { channel_id: interaction.channelId }
      });

      if (!grupo) {
        return interaction.editReply("❌ **Canal não mapeado:** Este canal não está registrado como um Grupo Global de vendas.");
      }

      // 3. Busca a configuração da obra (Vínculo)
      // Prioridade 1: Preço definido pelo próprio vendedor para este grupo
      // Prioridade 2: Preço definido pelo Admin (Dono do Grupo) para este grupo
      const configuracao = await prisma.userSeries.findFirst({
        where: { 
          grupo_id: grupo.id,
          produto: { nome: produtoNome },
          OR: [
            { user_id: vendedor.id },
            { user_id: grupo.user_id }
          ],
          ativo: true
        },
        include: { produto: true },
        orderBy: { user_id: 'asc' } // Isso ajuda a priorizar o vendedor logado se houver conflito
      });

      if (!configuracao) {
        return interaction.editReply(`❌ **Obra não configurada:** A obra **${produtoNome}** não possui preço definido para este grupo.`);
      }

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

      // 4. Verificação de Duplicidade (Neste grupo específico)
      const existentes = await prisma.venda.findMany({
        where: { 
          grupo_id: grupo.id, 
          produto_id: configuracao.produto_id, 
          quantidade: { in: numeros } 
        },
        select: { quantidade: true, user: { select: { discord_username: true } } }
      });

      const jaVendidos = existentes.map(v => v.quantidade);
      const paraCriar = numeros.filter(n => !jaVendidos.includes(n));
      const precoUnit = Number(configuracao.preco);

      // 5. Registro das Vendas em Transação
      if (paraCriar.length > 0) {
        await prisma.$transaction(
          paraCriar.map(n => prisma.venda.create({
            data: {
              user_id: vendedor.id,
              produto_id: configuracao.produto_id,
              grupo_id: grupo.id,
              quantidade: n,
              preco_unitario: precoUnit,
              preco_total: precoUnit,
              data_venda: new Date(),
              observacoes: `Via bot: ${interaction.user.username}`
            }
          }))
        );

        // Registro de Log Global
        await prisma.activityLog.create({
          data: {
            user_id: vendedor.id,
            action: "venda_bot_lote",
            entity_type: "venda",
            details: { obra: configuracao.produto.nome, caps: paraCriar, grupo: grupo.nome }
          }
        });
      }

      // --- Resposta Visual ---
      const totalFaturado = paraCriar.length * precoUnit;
      const embed = new EmbedBuilder()
        .setAuthor({ name: "Yakuza Raws System", iconURL: interaction.user.displayAvatarURL() })
        .setTitle(paraCriar.length > 0 ? "✅ Venda Registrada" : "⚠️ Registro Duplicado")
        .setDescription(`**Série:** ${configuracao.produto.nome}\n**Grupo:** ${grupo.nome}`)
        .setColor(paraCriar.length > 0 ? "#2ecc71" : "#f1c40f")
        .addFields(
          { name: "💰 Faturamento", value: `R$ ${totalFaturado.toFixed(2)}`, inline: true },
          { name: "📖 Capítulos", value: paraCriar.length > 0 ? `\`${paraCriar.join(", ")}\`` : "Nenhum novo registro", inline: true }
        )
        .setThumbnail(configuracao.produto.imagem_url || null)
        .setFooter({ text: `Vendedor: ${vendedor.discord_username}` })
        .setTimestamp();

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