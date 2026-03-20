import { SlashCommandBuilder, EmbedBuilder, AttachmentBuilder } from "discord.js";
import prisma from "../../prisma/client.js";
import { format } from "date-fns";
import ptBR from 'date-fns/locale/pt-BR/index.js';

// Helper: Barra de Progresso Visual
const renderProgressBar = (atual, total) => {
  const tamanho = 12; // Tamanho da barra
  if (total === 0) return `\`[▱▱▱▱▱▱▱▱▱▱▱▱]\` (0%)`;
  const progresso = Math.min(tamanho, Math.round((tamanho * atual) / total));
  const vazio = tamanho - progresso;
  const porcentagem = Math.round((atual / total) * 100);
  return `\`[${"▰".repeat(progresso)}${"▱".repeat(vazio)}]\` (${porcentagem}%)`;
};

// Helper: Formatação de Moeda (BRL)
const formatCurrency = (value) => {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
};

export default {
  data: new SlashCommandBuilder()
    .setName("perfil")
    .setDescription("YAKUZA: Exibe sua ficha de membro e estatísticas de faturamento."),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    const discordUserId = interaction.user.id;
    const agora = new Date();
    const inicioMes = new Date(agora.getFullYear(), agora.getMonth(), 1);

    try {
      // 1. Identifica o Vendedor no Banco (Busca conta vinculada)
      const vendedor = await prisma.user.findUnique({
        where: { discord_id: discordUserId },
        include: {
          grupos: { select: { id: true, nome: true } } // Traz os grupos que ele gerencia
        }
      });

      if (!vendedor) {
        return interaction.editReply("❌ **Ficha não encontrada:** Acesse o dashboard do site e vincule sua conta Discord primeiro.");
      }

      // 2. Agregação de Dados Financeiros (Mensal e Histórico)
      const [statsMensal, statsTotal] = await Promise.all([
        // Faturamento do Mês Atual
        prisma.venda.aggregate({
          where: { 
            user_id: vendedor.id,
            data_venda: { gte: inicioMes } 
          },
          _sum: { preco_total: true },
          _count: { id: true }
        }),
        // Faturamento Histórico Total
        prisma.venda.aggregate({
          where: { user_id: vendedor.id },
          _sum: { preco_total: true }
        })
      ]);

      const faturamentoMensal = Number(statsMensal._sum.preco_total || 0);
      const capitulosMensais = statsMensal._count.id;
      const faturamentoTotal = Number(statsTotal._sum.preco_total || 0);

      // Média por Capítulo (Mensal)
      const mediaPorCapitulo = capitulosMensais > 0 ? faturamentoMensal / capitulosMensais : 0;

      // 3. Lógica de Meta (Exemplo: Meta padrão de R$ 1.000,00)
      const metaMensalDefinida = 1000; 

      // 4. Formatação de Datas
      const dataCadastro = vendedor.created_at 
        ? format(vendedor.created_at, "dd 'de' MMMM 'de' yyyy", { locale: ptBR })
        : "Data desconhecida";
      const mesAtualNome = format(agora, "MMMM", { locale: ptBR });

      // 5. Design do Embed Yakuza Raws (Roxo Style)
      const embed = new EmbedBuilder()
        .setAuthor({ 
          name: `Ficha de Membro: ${vendedor.discord_username}`, 
          iconURL: interaction.user.displayAvatarURL({ dynamic: true }) 
        })
        .setTitle(`🏮 Yakuza Raws Status`)
        .setDescription(`Membro ativo desde: \`${dataCadastro}\`\nNível de Acesso: **${vendedor.role.toUpperCase()}**`)
        .setColor("#800080") // Roxo Yakuza
        .addFields(
          { name: "\u200B", value: "📊 **ESTATÍSTICAS DO MÊS**", inline: false },
          { name: "💰 Faturamento", value: `**${formatCurrency(faturamentoMensal)}**`, inline: true },
          { name: "📖 Capítulos", value: `\`${capitulosMensais}\` lançamentos`, inline: true },
          { name: "📉 Média/Cap", value: `${formatCurrency(mediaPorCapitulo)}`, inline: true },
          { name: "\u200B", value: "🏆 **META DE FATURAMENTO**", inline: false },
          { 
            name: `Meta de ${mesAtualNome.toUpperCase()}`, 
            value: `${renderProgressBar(faturamentoMensal, metaMensalDefinida)}\n**${formatCurrency(faturamentoMensal)}** de **${formatCurrency(metaMensalDefinida)}**`,
            inline: false 
          },
          { name: "\u200B", value: "🏛️ **HISTÓRICO TOTAL**", inline: false },
          { name: "💸 Acumulado Global", value: `**${formatCurrency(faturamentoTotal)}** arrecadados`, inline: false }
        )
        .setFooter({ text: "Yakuza Raws • Disciplina e Faturamento" })
        .setTimestamp();

      // Se ele for Admin, mostramos quantos grupos ele gerencia
      if (vendedor.role === 'admin' && vendedor.grupos.length > 0) {
        embed.addFields({ 
          name: "🛡️ Grupos que Gerencia", 
          value: `\`${vendedor.grupos.length}\` grupos registrados` 
        });
      }

      return interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error("Erro no comando /perfil:", error);
      return interaction.editReply(`❌ **Erro Interno:** Não foi possível consultar sua ficha no banco de dados.`);
    }
  }
};