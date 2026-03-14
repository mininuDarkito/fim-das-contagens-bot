import { SlashCommandBuilder, AttachmentBuilder } from "discord.js";
import { Parser } from "json2csv"; // precisamos instalar json2csv



export default {
  data: new SlashCommandBuilder()
    .setName("exportarcsv")
    .setDescription("Exporta todas as vendas do grupo atual em CSV."),

  async execute(interaction) {
    // buscar grupo + vendas + produto
    const grupo = await prisma.grupo.findUnique({
      where: { channelId: interaction.channelId },
      include: {
        vendas: {
          include: { produto: true }
        }
      }
    });

    if (!grupo) {
      return interaction.reply({
        content: "❌ Este canal não é um grupo.",
        ephemeral: true
      });
    }

    if (grupo.vendas.length === 0) {
      return interaction.reply({
        content: "Nenhuma venda registrada ainda.",
        ephemeral: true
      });
    }

    // preparar dados para CSV
    const vendasCSV = grupo.vendas.map(venda => ({
      Produto: venda.produto?.name || "Desconhecido",
      Numero: venda.numero,
      Plataforma: venda.produto?.platform || "Desconhecida",
      Valor: venda.produto?.valor?.toFixed(2) || "0.00",
      Comprador: venda.buyer,
      NomeDoComprador: venda.buyerName || "Desconecido"
    }));

    try {
      // gerar CSV
      const parser = new Parser({ fields: ["Produto", "Numero",  "Plataforma", "Valor", "Comprador", "NomeDoComprador"] });
      const csv = parser.parse(vendasCSV);

      // criar attachment
      const buffer = Buffer.from(csv, "utf-8");
      const attachment = new AttachmentBuilder(buffer, { name: `vendas_${grupo.nome ?? grupo.channelId}.csv` });

      // enviar
      await interaction.reply({
        content: `📄 CSV de vendas do grupo **${grupo.nome ?? grupo.channelId}**`,
        files: [attachment],
        ephemeral: true
      });

    } catch (error) {
      console.error("Erro ao exportar CSV:", error);
      await interaction.reply({
        content: "❌ Ocorreu um erro ao gerar o CSV.",
        ephemeral: true
      });
    }
  }
};
