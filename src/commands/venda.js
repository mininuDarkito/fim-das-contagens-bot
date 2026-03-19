import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } from "discord.js";
import prisma from "../../prisma/client.js";
import { autocompleteProdutos } from "../ultils/autocomplete.js";

export default {
  data: new SlashCommandBuilder()
    .setName("venda")
    .setDescription("Registra a venda de capítulos/unidades.")
    .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages)
    .addStringOption(o =>
      o.setName("produto").setDescription("Obra vendida.").setAutocomplete(true).setRequired(true)
    )
    .addStringOption(o =>
      o.setName("numero").setDescription("Número ou intervalo (ex: 5 ou 5-10)").setRequired(true)
    ),

  async autocomplete(interaction) {
    await autocompleteProdutos(prisma, interaction);
  },

  async execute(interaction) {
    const produtoNome = interaction.options.getString("produto");
    const numeroInput = interaction.options.getString("numero");
    const discordUserId = interaction.user.id;

    // Uso de MessageFlags para evitar o warning de depreciação
    await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

    try {
      // 1. Identifica QUEM está vendendo (Busca o usuário pelo Discord ID)
      const vendedor = await prisma.user.findUnique({
        where: { discord_id: discordUserId }
      });

      if (!vendedor) {
        return interaction.editReply("❌ Você não possui uma conta vinculada. Acesse o dashboard no site primeiro.");
      }

      // 2. Identifica o Grupo Global vinculado a este canal
      const grupo = await prisma.grupo.findUnique({
        where: { channel_id: interaction.channelId }
      });

      if (!grupo) return interaction.editReply("❌ Este canal não está registrado como um grupo de vendas global.");

      // 3. Busca a configuração da obra neste grupo específico
      const configuracao = await prisma.userSerie.findFirst({
        where: { 
          grupo_id: grupo.id,
          produto: { nome: produtoNome }
        },
        include: { produto: true }
      });

      if (!configuracao) return interaction.editReply(`❌ A obra **${produtoNome}** não está ativa neste grupo.`);

      // --- Lógica de Processamento de Números ---
      let numeros = [];
      if (numeroInput.includes("-")) {
        const [inicio, fim] = numeroInput.split("-").map(n => parseInt(n.trim()));
        if (isNaN(inicio) || isNaN(fim) || fim < inicio) return interaction.editReply("❌ Intervalo inválido.");
        for (let i = inicio; i <= fim; i++) numeros.push(i);
      } else {
        const n = parseInt(numeroInput.trim());
        if (isNaN(n)) return interaction.editReply("❌ Número inválido.");
        numeros.push(n);
      }

      // Verifica duplicatas globais no grupo para esta obra
      const existentes = await prisma.venda.findMany({
        where: { 
          grupo_id: grupo.id, 
          produto_id: configuracao.produto_id, 
          quantidade: { in: numeros } 
        },
        select: { quantidade: true }
      });

      const jaVendidos = existentes.map(v => v.quantidade);
      const paraCriar = numeros.filter(n => !jaVendidos.includes(n));
      const precoUnit = Number(configuracao.preco);

      // 4. Criação das Vendas vinculadas ao VENDEDOR (Individual) e ao GRUPO (Global)
      if (paraCriar.length > 0) {
        await prisma.$transaction(
          paraCriar.map(n => prisma.venda.create({
            data: {
              user_id: vendedor.id, // O crédito vai para quem executou o comando
              produto_id: configuracao.produto_id,
              grupo_id: grupo.id,    // Registro no grupo global do canal
              quantidade: n,
              preco_unitario: precoUnit,
              preco_total: precoUnit,
              observacoes: `Vendedor: ${interaction.user.tag} (via Bot)`,
              data_venda: new Date()
            }
          }))
        );
      }

      // --- Resposta Visual ---
      const totalFin = paraCriar.length * precoUnit;
      const embed = new EmbedBuilder()
        .setTitle("🛒 Venda Processada")
        .setDescription(`Obra: **${configuracao.produto.nome}**\nGrupo: **${grupo.nome}**`)
        .setColor(paraCriar.length > 0 ? "#00FF00" : "#FFA500")
        .addFields(
          { name: "👤 Vendedor", value: interaction.user.username, inline: true },
          { name: "💰 Total", value: `R$ ${totalFin.toFixed(2)}`, inline: true },
          { name: "🔢 Capítulos", value: paraCriar.length > 0 ? paraCriar.join(", ") : "Nenhum novo registrado" }
        )
        .setTimestamp();

      if (jaVendidos.length > 0) {
        embed.addFields({ name: "⚠️ Já Vendidos neste grupo", value: jaVendidos.join(", ") });
      }

      return interaction.editReply({ embeds: [embed] });

    } catch (error) {
      if (error.code === 10062) return console.warn("Interação expirou.");
      console.error(error);
      return interaction.editReply(`❌ Erro técnico: ${error.message}`);
    }
  }
};