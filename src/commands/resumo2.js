import { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } from "discord.js";
import prisma from "../../prisma/client.js";

export default {
  data: new SlashCommandBuilder()
    .setName("resumo2")
    .setDescription("ADMIN: Gera um CSV detalhado com as vendas globais deste canal.")
    .addStringOption(option =>
      option.setName("mes")
        .setDescription("Selecione o mês do relatório")
        .setRequired(false)
        .addChoices(
          { name: 'Janeiro', value: '0' },
          { name: 'Fevereiro', value: '1' },
          { name: 'Março', value: '2' },
          { name: 'Abril', value: '3' },
          { name: 'Maio', value: '4' },
          { name: 'Junho', value: '5' },
          { name: 'Julho', value: '6' },
          { name: 'Agosto', value: '7' },
          { name: 'Setembro', value: '8' },
          { name: 'Outubro', value: '9' },
          { name: 'Novembro', value: '10' },
          { name: 'Dezembro', value: '11' },
          { name: 'Tudo (Histórico Completo)', value: 'all' }
        )
    ),

  async execute(interaction) {
    const mesEscolhido = interaction.options.getString("mes");
    await interaction.deferReply({ ephemeral: true });

    try {
      // 1. Lógica de Datas
      const agora = new Date();
      let filtroData = {};
      let nomeMes = "Mês Atual";

      if (mesEscolhido !== 'all') {
        const anoAtual = agora.getFullYear();
        const mesInt = mesEscolhido ? parseInt(mesEscolhido) : agora.getMonth();
        
        const dataInicio = new Date(anoAtual, mesInt, 1);
        const dataFim = new Date(anoAtual, mesInt + 1, 0, 23, 59, 59);
        
        filtroData = {
          data_venda: { gte: dataInicio, lte: dataFim }
        };
        nomeMes = dataInicio.toLocaleString('pt-BR', { month: 'long' });
      } else {
        nomeMes = "Histórico Completo";
      }

      // 2. Busca o Grupo e as Vendas (Incluindo o Vendedor/User)
      const grupo = await prisma.grupo.findUnique({
        where: { channel_id: interaction.channelId },
        include: {
          vendas: {
            where: filtroData,
            include: { 
              produto: true,
              user: true // ADICIONADO: Para saber quem vendeu
            },
            orderBy: { data_venda: 'asc' }
          }
        }
      });

      if (!grupo || !grupo.vendas || grupo.vendas.length === 0) {
        return interaction.editReply(`❌ Nenhuma venda encontrada para **${nomeMes}** neste canal.`);
      }

      // 3. Gerar CSV Otimizado para Contabilidade
      // Adicionada a coluna "Vendedor"
      let csvContent = "\ufeffVendedor;Produto;Capitulo;Data;Valor\n";
      let totalGeral = 0;

      grupo.vendas.forEach(venda => {
        const vendedor = venda.user?.discord_username || "Desconhecido";
        const produto = venda.produto?.nome || "Excluído";
        const capitulo = venda.quantidade;
        const data = venda.data_venda ? venda.data_venda.toLocaleDateString('pt-BR') : "N/A";
        const valor = Number(venda.preco_total || 0);

        totalGeral += valor;
        
        // Limpeza simples para evitar que ";" no nome quebre o CSV
        csvContent += `${vendedor};${produto.replace(/;/g, '-')};${capitulo};${data};${valor.toFixed(2).replace('.', ',')}\n`;
      });

      // 4. Preparação do Arquivo e Resposta
      const buffer = Buffer.from(csvContent, "utf-8");
      const fileName = `relatorio_${nomeMes.toLowerCase().replace(/ /g, '_')}_${grupo.nome.toLowerCase().replace(/ /g, '_')}.csv`;
      const attachment = new AttachmentBuilder(buffer, { name: fileName });

      const embed = new EmbedBuilder()
        .setTitle(`📊 Relatório Consolidado: ${grupo.nome}`)
        .setDescription(`Resumo das atividades do período: **${nomeMes.toUpperCase()}**`)
        .addFields(
          { name: "💰 Total Bruto", value: `**R$ ${totalGeral.toFixed(2)}**`, inline: true },
          { name: "📦 Itens Vendidos", value: `${grupo.vendas.length} capítulos`, inline: true }
        )
        .setFooter({ text: "Relatório gerado para conferência administrativa" })
        .setColor("#2ecc71")
        .setTimestamp();

      await interaction.editReply({ embeds: [embed], files: [attachment] });

    } catch (error) {
      console.error("❌ Erro ao gerar resumo CSV:", error);
      interaction.editReply("❌ Erro interno ao processar o arquivo CSV.");
    }
  }
};