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
    )
    .addStringOption(o =>
      o.setName("valor")
        .setDescription("Preço por capítulo (Obrigatório apenas na 1ª vez que for vender a obra)")
        .setRequired(false)
    ),

  async autocomplete(interaction) {
    await autocompleteProdutos(prisma, interaction);
  },

  async execute(interaction) {
    const produtoNome = interaction.options.getString("produto");
    const numeroInput = interaction.options.getString("numero");
    const valorInput = interaction.options.getString("valor");
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

      // 4. Busca a configuração de preço (Vínculo)
      let configuracao = await prisma.userSeries.findFirst({
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

      let precoUnit = 0;
      let recemVinculado = false;

      // --- LÓGICA INTELIGENTE DE VÍNCULO ---
      if (!configuracao) {
        // Se a obra não tá vinculada, VERIFICA se o cara passou o valor
        if (!valorInput) {
            return interaction.editReply(`⚠️ **Primeiro Lançamento:** Você ainda não vinculou **${obraGlobal.nome}** neste grupo.\n\nPor favor, repita o comando e preencha o campo opcional \`valor\` (ex: \`0,50\`). O bot fará o vínculo automático para as próximas vezes!`);
        }

        // Formata o valor (aceita vírgula ou ponto)
        precoUnit = parseFloat(valorInput.replace(",", "."));
        if (isNaN(precoUnit) || precoUnit < 0) {
            return interaction.editReply("❌ **Valor Inválido:** O formato do preço está incorreto. Use números, como `0,50` ou `1.50`.");
        }

        // Cria o vínculo no banco de dados na hora
        configuracao = await prisma.userSeries.create({
            data: {
                user_id: vendedor.id,
                produto_id: obraGlobal.id,
                grupo_id: grupo.id,
                preco: precoUnit,
                ativo: true
            }
        });
        recemVinculado = true;
      } else {
        // Já tem vínculo, puxa o valor do banco (ignora se ele preencheu valor de bobeira)
        precoUnit = Number(configuracao.preco);
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
              produto_id: obraGlobal.id,
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
            details: { obra: obraGlobal.nome, caps: paraCriar, grupo: grupo.nome, auto_vinculo: recemVinculado }
          }
        });
      }

      // --- Resposta Visual (Embed) ---
      const totalFaturado = paraCriar.length * precoUnit;
      
      // Validação de URL para evitar o crash 431 no Discord
      let validThumbnail = null;
      if (obraGlobal.imagem_url && obraGlobal.imagem_url.startsWith("http")) {
        validThumbnail = obraGlobal.imagem_url;
      }

      const embed = new EmbedBuilder()
        .setAuthor({ name: "Yakuza Raws System", iconURL: interaction.user.displayAvatarURL() })
        .setTitle(paraCriar.length > 0 ? "✅ Venda Registrada" : "⚠️ Registro Duplicado")
        .setColor(paraCriar.length > 0 ? "#2ecc71" : "#f1c40f")
        .setThumbnail(validThumbnail) 
        .setFooter({ text: `Vendedor: ${vendedor.discord_username}` })
        .setTimestamp();

      let descricao = `**Série:** ${obraGlobal.nome}\n**Grupo:** ${grupo.nome}`;
      
      // Aviso elegante de que o bot fez o trabalho de vínculo sozinho
      if (recemVinculado) {
        descricao += `\n\n✨ **Vínculo Automático:** A obra foi adicionada ao seu painel com o preço base de \`R$ ${precoUnit.toFixed(2)}\`. Nas próximas vendas, você não precisará informar o valor!`;
      } else if (valorInput && paraCriar.length > 0) {
        // Se ele passou o valor atoa (já tava vinculado)
        descricao += `\n\nℹ️ *O valor digitado foi ignorado pois esta série já está configurada no seu painel a \`R$ ${precoUnit.toFixed(2)}\`.*`;
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