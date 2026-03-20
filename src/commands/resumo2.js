import { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, PermissionFlagsBits } from "discord.js";
import prisma from "../../prisma/client.js";

export default {
  data: new SlashCommandBuilder()
    .setName("resumo2")
    .setDescription("YAKUZA ADMIN: Gera um relatório CSV das vendas deste grupo.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
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
      // 1. Validação de Admin no Banco Yakuza
      const admin = await prisma.user.findUnique({ where: { discord_id: interaction.user.id } });
      if (!admin || admin.role !== 'admin') {
        return interaction.editReply("❌ **Acesso Negado:** Apenas administradores podem extrair relatórios financeiros.");
      }

      // 2. Lógica de Datas
      const agora = new Date();
      let filtroData = {};
      let nomeMes = "Mês Atual";

      if (mesEscolhido !== 'all') {
        const anoAtual = agora.getFullYear();
        const mesInt = mesEscolhido ? parseInt(mesEscolhido) : agora.getMonth();
        
        const dataInicio = new Date(anoAtual, mesInt, 1);
        const dataFim = new Date(anoAtual, mesInt + 1, 0, 23, 59, 59);
        
        filtroData = { gte: dataInicio, lte: dataFim };
        nomeMes = dataInicio.toLocaleString('pt-BR', { month: 'long' });
      } else {
        nomeMes = "Histórico Completo";
      }

      // 3. Busca o Grupo e as Vendas Filtradas
      const grupo = await prisma.grupo.findUnique({
        where: { channel_id: interaction.channelId }
      });

      if (!grupo) return interaction.editReply("❌ Este canal não está registrado como um **Grupo Global** da Yakuza Raws.");

      const vendas = await prisma.venda.findMany({
        where: { 
          grupo_id: grupo.id,
          data_venda: filtroData.gte ? filtroData : undefined
        },
        include: { 
          produto: true,
          user: true 
        },
        orderBy: { data_venda: 'asc' }
      });

      if (vendas.length === 0) {
        return interaction.editReply(`❌ Nenhuma venda encontrada para **${nomeMes.toUpperCase()}** neste canal.`);
      }

      // 4. Gerar CSV (Otimizado para Excel/Google Sheets)
      let csvContent = "\ufeffVendedor;Produto;Capitulo;Data;Valor\n";
      let totalGeral = 0;

      vendas.forEach(venda => {
        const vendedor = venda.user?.discord_username || "Desconhecido";
        const produto = venda.produto?.nome || "Excluído";
        const capitulo = venda.quantidade;
        const data = venda.data_venda ? venda.data_venda.toLocaleDateString('pt-BR') : "N/A";
        const valor = Number(venda.preco_total || 0);

        totalGeral += valor;
        csvContent += `${vendedor};${produto.replace(/;/g, '-')};${capitulo};${data};${valor.toFixed(2).replace('.', ',')}\n`;
      });

      // 5. Preparação do Arquivo
      const buffer = Buffer.from(csvContent, "utf-8");
      const fileName = `YAKUZA_REPORTE_${nomeMes.toUpperCase()}_${grupo.nome.replace(/\s+/g, '_')}.csv`;
      const attachment = new AttachmentBuilder(buffer, { name: fileName });

      // 6. Resposta com Estética Roxa
      const embed = new EmbedBuilder()
        .setTitle(`🏮 Relatório Consolidado: ${grupo.nome}`)
        .setDescription(`Arquivo de contabilidade gerado para o período: **${nomeMes.toUpperCase()}**`)
        .setColor("#800080") // Roxo Yakuza
        .addFields(
          { name: "💰 Total Bruto", value: `**R$ ${totalGeral.toFixed(2)}**`, inline: true },
          { name: "📦 Lançamentos", value: `\`${vendas.length}\` capítulos`, inline: true }
        )
        .setFooter({ text: "Yakuza Raws • Relatório de Auditoria Financeira" })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed], files: [attachment] });

    } catch (error) {
      console.error("❌ Erro ao gerar resumo CSV:", error);
      interaction.editReply("❌ **Erro Interno:** Não foi possível processar o arquivo de contabilidade.");
    }
  }
};