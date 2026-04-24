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

      // 4. Busca a configuração de PREÇO (Grupo) e VÍNCULO (Usuário)
      const [configuracaoPreco, vinculoUsuario] = await Promise.all([
        prisma.grupo_series.findUnique({
          where: { grupo_id_produto_id: { grupo_id: grupo.id, produto_id: obraGlobal.id } }
        }),
        prisma.userSerie.findUnique({
          where: { user_id_produto_id_grupo_id: { user_id: vendedor.id, produto_id: obraGlobal.id, grupo_id: grupo.id } }
        })
      ]);

      let precoUnit = 0;
      let recemVinculado = false;

      // --- LÓGICA INTELIGENTE DE PREÇO E VÍNCULO ---
      if (!configuracaoPreco) {
        // Se a obra não tem preço no grupo, VERIFICA se o cara passou o valor
        if (!valorInput) {
            return interaction.editReply(`⚠️ **Configuração de Preço:** Esta obra ainda não tem um preço definido para este grupo.\n\nPor favor, repita o comando e preencha o campo opcional \`valor\` (ex: \`0,50\`). Isso definirá o preço para todos no grupo!`);
        }

        // Formata o valor
        precoUnit = parseFloat(valorInput.replace(",", "."));
        if (isNaN(precoUnit) || precoUnit < 0) {
            return interaction.editReply("❌ **Valor Inválido:** O formato do preço está incorreto. Use números, como `0,50` ou `1.50`.");
        }

        // Cria a configuração de preço no grupo
        await prisma.grupo_series.create({
            data: {
                grupo_id: grupo.id,
                produto_id: obraGlobal.id,
                preco: precoUnit
            }
        });
        recemVinculado = true;
      } else {
        precoUnit = Number(configuracaoPreco.preco);
      }

      // Garante que o usuário está vinculado (para aparecer no dashboard dele)
      if (!vinculoUsuario) {
        await prisma.userSerie.create({
            data: {
                user_id: vendedor.id,
                produto_id: obraGlobal.id,
                grupo_id: grupo.id,
                ativo: true
            }
        });
      }

      // --- Lógica de Processamento de Capítulos ---
      let numeros = [];
      if (numeroInput.includes("-")) {
        const [inicio, fim] = numeroInput.split("-").map(n => parseFloat(n.trim().replace(",", ".")));
        if (isNaN(inicio) || isNaN(fim) || fim < inicio) return interaction.editReply("❌ **Erro:** Intervalo de capítulos inválido.");
        for (let i = inicio; i <= fim; i++) numeros.push(i);
      } else {
        const n = parseFloat(numeroInput.trim().replace(",", "."));
        if (isNaN(n)) return interaction.editReply("❌ **Erro:** Número do capítulo inválido.");
        numeros.push(n);
      }

      // 5. Verificação de Duplicidade (Neste grupo) - Usando 'capitulo'
      const existentes = await prisma.venda.findMany({
        where: { 
          grupo_id: grupo.id, 
          produto_id: obraGlobal.id, 
          capitulo: { in: numeros } 
        },
        select: { capitulo: true }
      });

      const jaVendidos = existentes.map(v => Number(v.capitulo));
      const paraCriar = numeros.filter(n => !jaVendidos.includes(n));

      // 6. Registro das Vendas em Transação
      if (paraCriar.length > 0) {
        await prisma.$transaction(
          paraCriar.map(n => prisma.venda.create({
            data: {
              user_id: vendedor.id,
              produto_id: obraGlobal.id,
              grupo_id: grupo.id,
              capitulo: n, // Corrigido de quantidade para capitulo
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
            details: { obra: obraGlobal.nome, caps: paraCriar, grupo: grupo.nome, novo_preco_grupo: recemVinculado }
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
      
      if (recemVinculado) {
        descricao += `\n\n✨ **Preço Definido:** O preço para este grupo foi configurado como \`R$ ${precoUnit.toFixed(2)}\`.`;
      } else if (valorInput && paraCriar.length > 0) {
        descricao += `\n\nℹ️ *O valor digitado foi ignorado pois esta série já tem preço definido neste grupo (\`R$ ${precoUnit.toFixed(2)}\`).*`;
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