import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import prisma from "../../prisma/client.js";
import { autocompleteProdutos } from "../ultils/autocomplete.js";

export default {
  data: new SlashCommandBuilder()
    .setName("venda")
    .setDescription("Registra uma venda de capítulo/unidade.")
    .addStringOption(o =>
      o.setName("produto")
        .setDescription("Produto vendido.")
        .setAutocomplete(true)
        .setRequired(true)
    )
    .addStringOption(o =>
      o.setName("numero")
        .setDescription("Número vendido ou intervalo (ex: 4 ou 4-10)")
        .setRequired(true)
    ),

  async autocomplete(interaction) {
    await autocompleteProdutos(prisma, interaction);
  },

  async execute(interaction) {
    const produtoNome = interaction.options.getString("produto");
    const numeroInput = interaction.options.getString("numero");

    await interaction.deferReply({ ephemeral: true });

    try {
      // 1. Localizar o grupo pelo canal
      const grupo = await prisma.grupo.findUnique({
        where: { channel_id: interaction.channelId }
      });

      if (!grupo) return interaction.editReply("❌ Este canal não é um grupo de vendas registrado.");

      // 2. Localizar a configuração (Usando user_series com snake_case conforme seu erro anterior)
      const configuracao = await prisma.user_series.findFirst({
        where: { 
          grupo_id: grupo.id,
          produto: { nome: produtoNome }
        },
        include: { produto: true }
      });

      if (!configuracao) return interaction.editReply(`❌ O produto **${produtoNome}** não está configurado para este grupo.`);

      // 3. Tratar intervalo de números
      let numerosParaVenda = [];
      if (numeroInput.includes("-")) {
        const [inicio, fim] = numeroInput.split("-").map(n => parseInt(n.trim()));
        if (isNaN(inicio) || isNaN(fim) || fim < inicio) return interaction.editReply("❌ Intervalo inválido (ex: 10-20).");
        // Trava de segurança para não explodir o banco
        if (fim - inicio > 100) return interaction.editReply("❌ Por segurança, registre no máximo 100 capítulos por vez.");
        
        for (let i = inicio; i <= fim; i++) numerosParaVenda.push(i);
      } else {
        const n = parseInt(numeroInput.trim());
        if (isNaN(n)) return interaction.editReply("❌ Número de capítulo inválido.");
        numerosParaVenda.push(n);
      }

      const registrados = [];
      const duplicados = [];
      const precoUnitario = Number(configuracao.preco);

      // 4. Verificar duplicatas em massa antes de criar
      const vendasExistentes = await prisma.venda.findMany({
        where: {
          grupo_id: grupo.id,
          produto_id: configuracao.produto_id,
          quantidade: { in: numerosParaVenda } // Onde quantidade é o número do cap
        },
        select: { quantidade: true }
      });

      const idsExistentes = vendasExistentes.map(v => v.quantidade);

      // 5. Filtrar o que realmente será criado
      const paraCriar = numerosParaVenda.filter(n => {
        if (idsExistentes.includes(n)) {
          duplicados.push(n);
          return false;
        }
        return true;
      });

      // 6. Criar vendas usando Transaction para garantir integridade
      if (paraCriar.length > 0) {
        await prisma.$transaction(
          paraCriar.map(n => prisma.venda.create({
            data: {
              user_id: grupo.user_id,
              produto_id: configuracao.produto_id,
              grupo_id: grupo.id,
              quantidade: n, 
              preco_unitario: precoUnitario,
              preco_total: precoUnitario,
              observacoes: `Venda via bot: ${interaction.user.tag}`,
              data_venda: new Date()
            }
          }))
        );
        registrados.push(...paraCriar);
      }

      // 7. Feedback com Embed
      const totalGeral = registrados.length * precoUnitario;
      const embed = new EmbedBuilder()
        .setTitle("🛒 Venda Registrada")
        .setDescription(`Obra: **${configuracao.produto.nome}**`)
        .setColor(registrados.length > 0 ? 0x00FF00 : 0xFFFF00)
        .addFields(
          { name: "🔢 Capítulos", value: registrados.length > 0 ? registrados.join(", ") : "Nenhum novo" },
          { name: "💰 Total", value: `R$ ${totalGeral.toFixed(2)}`, inline: true },
          { name: "👤 Vendedor", value: interaction.user.username, inline: true }
        );

      if (duplicados.length > 0) {
        embed.addFields({ name: "⚠️ Já vendidos", value: duplicados.join(", ") });
      }

      return interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error("Erro no comando venda:", error);
      return interaction.editReply(`❌ Erro técnico: ${error.message}`);
    }
  }
};