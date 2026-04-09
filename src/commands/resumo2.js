import { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder, PermissionFlagsBits } from "discord.js";
import prisma from "../../prisma/client.js";
import ExcelJS from "exceljs";

export default {
  data: new SlashCommandBuilder()
    .setName("resumo2")
    .setDescription("YAKUZA ADMIN: Gera um relatório Excel das vendas deste grupo.")
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

      // 4. Agrupar vendas por Produto
      const vendasPorProduto = {};
      let totalGeral = 0;

      vendas.forEach(venda => {
        const produtoId = venda.produto.id;
        const capituloNum = venda.quantidade;
        const valor = Number(venda.preco_total || 0);

        if (!vendasPorProduto[produtoId]) {
          vendasPorProduto[produtoId] = {
            nomeSerie: venda.produto.nome,
            plataforma: venda.produto.plataforma || "N/A",
            capitulos: [],
            valorTotal: 0
          };
        }

        vendasPorProduto[produtoId].capitulos.push(capituloNum);
        vendasPorProduto[produtoId].valorTotal += valor;
        totalGeral += valor;
      });

      // 5. Criar workbook Excel
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Relatório de Vendas");

      // 6. Configurar cabeçalhos
      worksheet.columns = [
        { header: "Nome da Série", key: "nomeSerie", width: 30 },
        { header: "Capítulos Vendidos", key: "capitulos", width: 40 },
        { header: "Quantidade", key: "quantidade", width: 12 },
        { header: "Plataforma", key: "plataforma", width: 15 },
        { header: "Valor Unitário ($)", key: "valorUnit", width: 18 },
        { header: "Valor Total ($)", key: "valor", width: 15 }
      ];

      // 7. Estilizar cabeçalho
      worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
      worksheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF800080" } };
      worksheet.getRow(1).alignment = { horizontal: "center", vertical: "center" };

      // 8. Preencher dados
      let linhaAtual = 2;
      Object.values(vendasPorProduto).forEach(produto => {
        const capitalulosOrdenados = [...new Set(produto.capitulos)].sort((a, b) => a - b);
        const capitulosFormatados = capitalulosOrdenados.map(c => `#${c}`).join(", ");
        const quantidadeTotal = capitalulosOrdenados.length;

        worksheet.addRow({
          nomeSerie: produto.nomeSerie,
          capitulos: capitulosFormatados,
          quantidade: quantidadeTotal,
          plataforma: produto.plataforma,
          valorUnit: (produto.valorTotal / quantidadeTotal).toFixed(2),

          valor: produto.valorTotal.toFixed(2)
        });

        linhaAtual++;
      });

      // 9. Adicionar linha de total
      linhaAtual++;
      worksheet.addRow({
        nomeSerie: "TOTAL",
        capitulos: "",
        quantidade: "",
        plataforma: "",
        valorUnit: "",
        valor: totalGeral.toFixed(2)
      });

      const linhaTotal = worksheet.getRow(linhaAtual);
      linhaTotal.font = { bold: true, color: { argb: "FFFFFFFF" } };
      linhaTotal.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF800080" } };
      linhaTotal.alignment = { horizontal: "right", vertical: "center" };

      // 10. Centralizar números
      worksheet.eachRow((row, rowNumber) => {
        if (rowNumber > 1) {
          worksheet.getCell(`C${rowNumber}`).alignment = { horizontal: "center" };
          worksheet.getCell(`D${rowNumber}`).alignment = { horizontal: "center" };
          worksheet.getCell(`E${rowNumber}`).alignment = { horizontal: "right" };
        }
      });

      // 11. Gerar Buffer para arquivo
      const buffer = await workbook.xlsx.writeBuffer();
      const fileName = `YAKUZA_REPORTE_${nomeMes.toUpperCase()}_${grupo.nome.replace(/\s+/g, '_')}.xlsx`;
      const attachment = new AttachmentBuilder(buffer, { name: fileName });

      // 12. Resposta com Estética Roxa
      const embed = new EmbedBuilder()
        .setTitle(`🏮 Relatório Consolidado: ${grupo.nome}`)
        .setDescription(`Arquivo de contabilidade em Excel gerado para o período: **${nomeMes.toUpperCase()}**`)
        .setColor("#800080") // Roxo Yakuza
        .addFields(
          { name: "💰 Total Bruto", value: `**R$ ${totalGeral.toFixed(2)}**`, inline: true },
          { name: "📊 Produtos", value: `\`${Object.keys(vendasPorProduto).length}\` produtos`, inline: true }
        )
        .setFooter({ text: "Yakuza Raws • Relatório de Auditoria Financeira" })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed], files: [attachment] });

    } catch (error) {
      console.error("❌ Erro ao gerar resumo Excel:", error);
      interaction.editReply("❌ **Erro Interno:** Não foi possível processar o arquivo de contabilidade.");
    }
  }
};