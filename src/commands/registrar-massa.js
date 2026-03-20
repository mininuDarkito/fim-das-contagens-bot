import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from "discord.js";
import prisma from "../../prisma/client.js";
import path from "path";
import fs from "fs";

const renderProgressBar = (atual, total) => {
  const tamanho = 10;
  const progresso = Math.round((tamanho * atual) / total);
  const vazio = tamanho - progresso;
  return `[${"▰".repeat(progresso)}${"▱".repeat(vazio)}] (${Math.round((atual / total) * 100)}%)`;
};

const truncate = (str, limit = 1024) => str.length > limit ? str.substring(0, limit - 3) + "..." : str;

const delay = (ms) => new Promise(res => setTimeout(res, ms));

export default {
  data: new SlashCommandBuilder()
    .setName("registrar-massa")
    .setDescription("ADMIN: Scraper de múltiplos produtos para este grupo global.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(o => o.setName("plataforma").setDescription("Escolha o scraper").setAutocomplete(true).setRequired(true))
    .addStringOption(o => o.setName("links").setDescription("Links separados por ESPAÇO ou QUEBRA DE LINHA").setRequired(true))
    .addNumberOption(o => o.setName("valor").setDescription("Preço padrão para este grupo").setRequired(true)),

  async autocomplete(interaction) {
    const focusedValue = interaction.options.getFocused().toLowerCase();
    const scrapersPath = path.join(process.cwd(), "src/scrapers");
    if (!fs.existsSync(scrapersPath)) return interaction.respond([]);

    const files = fs.readdirSync(scrapersPath)
      .filter(f => f.endsWith(".js"))
      .map(f => f.replace(".js", ""));

    const filtered = files.filter(choice => choice.includes(focusedValue)).slice(0, 25);
    await interaction.respond(filtered.map(choice => ({ name: choice.toUpperCase(), value: choice })));
  },

  async execute(interaction) {
    const plataformaSlug = interaction.options.getString("plataforma");
    const linksRaw = interaction.options.getString("links");
    const valor = interaction.options.getNumber("valor");
    
    const listaLinks = [...new Set(linksRaw.split(/[\s,\n,]+/).filter(link => link.startsWith('http')))];

    if (listaLinks.length === 0) return interaction.reply({ content: "❌ Nenhum link válido enviado.", ephemeral: true });

    await interaction.deferReply({ ephemeral: true });

    try {
      // 1. Validação de Admin e Grupo
      const admin = await prisma.user.findUnique({ where: { discord_id: interaction.user.id } });
      if (!admin || admin.role !== 'admin') {
        return interaction.editReply("❌ **Acesso Negado:** Apenas administradores cadastrados podem realizar registros em massa.");
      }

      const grupo = await prisma.grupo.findUnique({ where: { channel_id: interaction.channelId } });
      if (!grupo) return interaction.editReply("❌ Este canal não está registrado como um **Grupo Global**.");

      const pathScript = path.join(process.cwd(), `src/scrapers/${plataformaSlug}.js`);
      if (!fs.existsSync(pathScript)) return interaction.editReply(`❌ Scraper \`${plataformaSlug}\` não encontrado.`);

      const scraperModule = await import(`file://${pathScript}`);
      const scrapeFunc = scraperModule.scrape || (scraperModule.default?.scrape) || scraperModule.default;

      const resultados = { sucessos: [], falhas: [] };

      // 2. Loop de Processamento
      for (let i = 0; i < listaLinks.length; i++) {
        let url = listaLinks[i];
        
        await interaction.editReply({
          content: `⏳ Processando obra **${i + 1} de ${listaLinks.length}** na plataforma **${plataformaSlug.toUpperCase()}**...\n${renderProgressBar(i + 1, listaLinks.length)}`
        });

        try {
          // Scraper
          const metadata = await scrapeFunc(url);
          if (!metadata?.nome) throw new Error("Dados não encontrados no link.");

          // Transação com a nova constraint
          await prisma.$transaction(async (tx) => {
            const produto = await tx.produto.upsert({
              where: { nome: metadata.nome },
              update: {
                plataforma: plataformaSlug,
                descricao: metadata.descricao || "Sem descrição.",
                imagem_url: metadata.imagem_url,
                link_serie: metadata.link_serie || url,
                updated_at: new Date()
              },
              create: {
                nome: metadata.nome,
                plataforma: plataformaSlug,
                descricao: metadata.descricao || "Sem descrição.",
                imagem_url: metadata.imagem_url,
                link_serie: metadata.link_serie || url
              }
            });

            // Atualizado para a constraint: user_id + produto_id + grupo_id
            await tx.userSeries.upsert({
              where: { 
                unique_user_produto_grupo: { 
                  user_id: admin.id, 
                  produto_id: produto.id,
                  grupo_id: grupo.id
                } 
              },
              update: { preco: valor, ativo: true, updated_at: new Date() },
              create: { 
                user_id: admin.id, 
                produto_id: produto.id, 
                grupo_id: grupo.id, 
                preco: valor, 
                ativo: true 
              }
            });
          });

          resultados.sucessos.push(metadata.nome);
        } catch (err) {
          resultados.falhas.push(`\`${url.split('/').pop()}\`: ${err.message}`);
        }

        if (listaLinks.length > 1) await delay(1000); // Delay maior para evitar bloqueio por IP
      }

      // 3. Relatório Final
      const embed = new EmbedBuilder()
        .setTitle("🔗 Registro em Massa Finalizado")
        .setDescription(`As obras abaixo foram integradas ao grupo **${grupo.nome}**.`)
        .setColor(resultados.falhas.length > 0 ? "#E74C3C" : "#2ECC71")
        .addFields(
          { name: `✅ Sucessos (${resultados.sucessos.length})`, value: truncate(resultados.sucessos.join("\n") || "Nenhum") },
          { name: `❌ Falhas (${resultados.falhas.length})`, value: truncate(resultados.falhas.join("\n") || "Nenhuma") }
        )
        .setThumbnail(resultados.sucessos.length > 0 ? "https://cdn-icons-png.flaticon.com/512/148/148767.png" : null)
        .setFooter({ text: `Yakuza Raws Scraper System • ${plataformaSlug.toUpperCase()}` })
        .setTimestamp();

      await interaction.editReply({ content: "✅ Processamento finalizado!", embeds: [embed] });

    } catch (error) {
      console.error("Erro crítico no registrar-massa:", error);
      await interaction.editReply({ content: `❌ Erro crítico: ${error.message}` });
    }
  }
};