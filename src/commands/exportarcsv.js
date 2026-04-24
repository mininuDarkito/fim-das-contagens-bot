import { SlashCommandBuilder, AttachmentBuilder, PermissionFlagsBits } from "discord.js";
import prisma from "../../prisma/client.js";

const getMesesChoices = () => {
  const choices = [];
  const agora = new Date();
  const nomesMeses = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

  for (let i = 0; i < 12; i++) {
    const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
    const label = `${nomesMeses[d.getMonth()]} / ${d.getFullYear()}`;
    const value = `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
    choices.push({ name: label, value: value });
  }
  return choices;
};

export default {
  data: new SlashCommandBuilder()
    .setName("exportarcsv")
    .setDescription("ADMIN: Exporta o backup bruto das vendas deste canal.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption(o => 
      o.setName("mes")
        .setDescription("Selecione o mês para filtrar")
        .setRequired(false)
        .addChoices(...getMesesChoices())
    ),

  async execute(interaction) {
    const mesFiltro = interaction.options.getString("mes");
    await interaction.deferReply({ ephemeral: true });

    try {
      let whereVendas = {};

      // Lógica de filtro por mês
      if (mesFiltro) {
        const [mes, ano] = mesFiltro.split("/").map(n => parseInt(n));
        if (isNaN(mes) || isNaN(ano) || mes < 1 || mes > 12) {
          return interaction.editReply("❌ **Formato de data inválido:** Use o formato `MM/AAAA` (ex: `04/2024`).");
        }

        const dataInicio = new Date(ano, mes - 1, 1);
        const dataFim = new Date(ano, mes, 1);
        whereVendas = {
          data_venda: {
            gte: dataInicio,
            lt: dataFim
          }
        };
      }

      // 1. Busca Grupo + Vendas + Produto + Vendedor (User)
      const grupo = await prisma.grupo.findUnique({
        where: { channel_id: interaction.channelId },
        include: {
          vendas: {
            where: whereVendas,
            include: { 
              produto: true,
              user: true 
            },
            orderBy: { data_venda: 'desc' }
          }
        }
      });

      if (!grupo) {
        return interaction.editReply("❌ Este canal não é um grupo registrado.");
      }

      if (!grupo.vendas || grupo.vendas.length === 0) {
        return interaction.editReply(mesFiltro ? `📭 Não existem vendas registradas em **${mesFiltro}** para exportar.` : "📭 Não existem vendas registradas neste grupo para exportar.");
      }

      // 2. Preparar cabeçalho e dados para CSV manual
      let csv = "\ufeffID_Venda;Data;Vendedor;Obra;Capitulo;Plataforma;Preco_Unit;Preco_Total\n";

      grupo.vendas.forEach(v => {
        const data = v.data_venda ? v.data_venda.toISOString().split('T')[0] : "N/A";
        const vendedor = v.user?.discord_username || "Desconhecido";
        const obra = v.produto?.nome?.replace(/;/g, "-") || "Excluída";
        const plataforma = v.produto?.plataforma?.toUpperCase() || "N/A";
        const valorUnit = Number(v.preco_unitario || 0).toFixed(2);
        const valorTotal = Number(v.preco_total || 0).toFixed(2);

        csv += `${v.id};${data};${vendedor};${obra};${v.capitulo};${plataforma};${valorUnit};${valorTotal}\n`;
      });

      // 3. Gerar o arquivo (Attachment)
      const buffer = Buffer.from(csv, "utf-8");
      const sufixoNome = mesFiltro ? `_${mesFiltro.replace("/", "-")}` : "";
      const nomeArquivo = `backup_vendas_${grupo.nome.replace(/\s+/g, '_').toLowerCase()}${sufixoNome}.csv`;
      const attachment = new AttachmentBuilder(buffer, { name: nomeArquivo });

      // 4. Enviar
      await interaction.editReply({
        content: `📄 **Backup Gerado!**\nForam exportadas **${grupo.vendas.length}** linhas de vendas ${mesFiltro ? `referentes a **${mesFiltro}**` : ""} do grupo **${grupo.nome}**.`,
        files: [attachment]
      });

    } catch (error) {
      console.error("❌ Erro ao exportar CSV bruto:", error);
      await interaction.editReply(`❌ Erro técnico: ${error.message}`);
    }
  }
};