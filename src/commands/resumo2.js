import { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } from "discord.js";
import prisma from "../../prisma/client.js";

export default {
  data: new SlashCommandBuilder()
    .setName("resumo2")
    .setDescription("Gera um arquivo CSV com o resumo de vendas do grupo.")
    .addStringOption(option =>
      option.setName("mes")
        .setDescription("Selecione o mês do relatório (Padrão: Mês atual)")
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
      let dataInicio, dataFim;
      let filtroData = {};

      if (mesEscolhido && mesEscolhido !== 'all') {
        const anoAtual = agora.getFullYear();
        const mesInt = parseInt(mesEscolhido);
        
        dataInicio = new Date(anoAtual, mesInt, 1);
        dataFim = new Date(anoAtual, mesInt + 1, 0, 23, 59, 59); // Último segundo do mês
        
        filtroData = {
          data_venda: {
            gte: dataInicio,
            lte: dataFim
          }
        };
      } else if (!mesEscolhido) {
        // Se não escolher nada, pega o mês atual por padrão
        dataInicio = new Date(agora.getFullYear(), agora.getMonth(), 1);
        dataFim = new Date(agora.getFullYear(), agora.getMonth() + 1, 0, 23, 59, 59);
        
        filtroData = {
          data_venda: {
            gte: dataInicio,
            lte: dataFim
          }
        };
      }

      // 2. Buscar no Banco com o Filtro
      const grupo = await prisma.grupo.findUnique({
        where: { channel_id: interaction.channelId },
        include: {
          vendas: {
            where: filtroData, // Aplica o filtro de data aqui
            include: { produto: true },
            orderBy: { data_venda: 'asc' }
          }
        }
      });

      if (!grupo || !grupo.vendas || grupo.vendas.length === 0) {
        const periodo = mesEscolhido === 'all' ? "no histórico" : "neste mês";
        return interaction.editReply(`❌ Nenhuma venda encontrada para gerar o relatório ${periodo}.`);
      }

      // 3. Gerar CSV
      let csvContent = "\ufeffNumero;Produto;Data;Valor\n";
      let totalGeral = 0;

      grupo.vendas.forEach(venda => {
        const numero = venda.quantidade;
        const produto = venda.produto?.nome || "Excluído";
        const data = venda.data_venda ? venda.data_venda.toLocaleDateString('pt-BR') : "N/A";
        const valor = Number(venda.preco_total || 0);

        totalGeral += valor;
        csvContent += `${numero};${produto.replace(/;/g, ',')};${data};${valor.toFixed(2)}\n`;
      });

      // 4. Envio
      const buffer = Buffer.from(csvContent, "utf-8");
      const nomeMes = mesEscolhido === 'all' ? "Completo" : (dataInicio ? dataInicio.toLocaleString('pt-BR', { month: 'long' }) : "Atual");
      
      const attachment = new AttachmentBuilder(buffer, { name: `resumo_${nomeMes.toLowerCase()}_${grupo.nome}.csv` });

      const embed = new EmbedBuilder()
        .setTitle(`📊 Relatório Financeiro: ${grupo.nome}`)
        .setDescription(`Período: **${nomeMes.toUpperCase()}**`)
        .addFields(
          { name: "Total do Período", value: `**R$ ${totalGeral.toFixed(2)}**`, inline: true },
          { name: "Vendas", value: `${grupo.vendas.length} itens`, inline: true }
        )
        .setColor("Green")
        .setTimestamp();

      await interaction.editReply({ embeds: [embed], files: [attachment] });

    } catch (error) {
      console.error(error);
      interaction.editReply("❌ Erro ao processar o relatório financeiro.");
    }
  }
};