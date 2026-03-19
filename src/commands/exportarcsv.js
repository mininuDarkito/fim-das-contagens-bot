import { SlashCommandBuilder, AttachmentBuilder, PermissionFlagsBits } from "discord.js";
import prisma from "../../prisma/client.js";

export default {
  data: new SlashCommandBuilder()
    .setName("exportarcsv")
    .setDescription("ADMIN: Exporta o backup bruto de TODAS as vendas deste canal.")
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      // 1. Busca Grupo + Vendas + Produto + Vendedor (User)
      // Note que usamos 'channel_id' (snake_case) conforme seu Schema
      const grupo = await prisma.grupo.findUnique({
        where: { channel_id: interaction.channelId },
        include: {
          vendas: {
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
        return interaction.editReply("📭 Não existem vendas registradas neste grupo para exportar.");
      }

      // 2. Preparar cabeçalho e dados para CSV manual (evita instalar json2csv)
      // \ufeff é o BOM para o Excel abrir com acentos corretamente
      let csv = "\ufeffID_Venda;Data;Vendedor;Obra;Capitulo;Plataforma;Preco_Unit;Preco_Total\n";

      grupo.vendas.forEach(v => {
        const data = v.data_venda ? v.data_venda.toISOString().split('T')[0] : "N/A";
        const vendedor = v.user?.discord_username || "Desconhecido";
        const obra = v.produto?.nome?.replace(/;/g, "-") || "Excluída";
        const plataforma = v.produto?.plataforma?.toUpperCase() || "N/A";
        const valorUnit = Number(v.preco_unitario || 0).toFixed(2);
        const valorTotal = Number(v.preco_total || 0).toFixed(2);

        csv += `${v.id};${data};${vendedor};${obra};${v.quantidade};${plataforma};${valorUnit};${valorTotal}\n`;
      });

      // 3. Gerar o arquivo (Attachment)
      const buffer = Buffer.from(csv, "utf-8");
      const nomeArquivo = `backup_vendas_${grupo.nome.replace(/\s+/g, '_').toLowerCase()}.csv`;
      const attachment = new AttachmentBuilder(buffer, { name: nomeArquivo });

      // 4. Enviar
      await interaction.editReply({
        content: `📄 **Backup Gerado!**\nForam exportadas **${grupo.vendas.length}** linhas de vendas do grupo **${grupo.nome}**.`,
        files: [attachment]
      });

    } catch (error) {
      console.error("❌ Erro ao exportar CSV bruto:", error);
      await interaction.editReply(`❌ Erro técnico: ${error.message}`);
    }
  }
};