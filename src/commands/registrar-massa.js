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

// Função para evitar bloqueios de API (Rate Limit)
const delay = (ms) => new Promise(res => setTimeout(res, ms));

export default {
  data: new SlashCommandBuilder()
    .setName("registrar-massa")
    .setDescription("ADMIN: Registra múltiplos produtos globais via links.")
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
    
    // Limpeza de links
    const listaLinks = [...new Set(linksRaw.split(/[\s,\n,]+/).filter(link => link.startsWith('http')))];

    if (listaLinks.length === 0) return interaction.reply({ content: "❌ Nenhum link válido enviado.", ephemeral: true });

    await interaction.deferReply({ ephemeral: true });

    const pathScript = path.join(process.cwd(), `src/scrapers/${plataformaSlug}.js`);
    if (!fs.existsSync(pathScript)) return interaction.editReply(`❌ Scraper \`${plataformaSlug}\` não encontrado.`);

    const resultados = { sucessos: [], falhas: [] };

    try {
      const scraperModule = await import(`file://${pathScript}`);
      const scrapeFunc = scraperModule.scrape || (scraperModule.default?.scrape) || scraperModule.default;

      // 1. Identifica o Grupo Global
      const grupo = await prisma.grupo.findUnique({ where: { channel_id: interaction.channelId } });
      if (!grupo) return interaction.editReply("❌ Este canal não é um Grupo Global registrado.");

      // 2. Loop de Processamento
      for (let i = 0; i < listaLinks.length; i++) {
        let url = listaLinks[i];
        
        // Atualiza status no Discord
        await interaction.editReply({
          content: `⏳ Processando obra **${i + 1} de ${listaLinks.length}** na plataforma **${plataformaSlug.toUpperCase()}**...\n${renderProgressBar(i + 1, listaLinks.length)}`
        });

        try {
          // Normalização específica (Ex: AC.QQ)
          if (plataformaSlug === 'acqq' && url.includes('ComicView')) {
            const matchId = url.match(/\/id\/(\d+)/);
            if (matchId) url = `https://ac.qq.com/Comic/comicInfo/id/${matchId[1]}`;
          }

          // Executa Scraper
          const metadata = await scrapeFunc(url);
          if (!metadata?.nome) throw new Error("Scraper retornou dados vazios.");

          // Transação para garantir consistência Produto + UserSerie
          await prisma.$transaction(async (tx) => {
            const produto = await tx.produto.upsert({
              where: { nome: metadata.nome },
              update: {
                plataforma: plataformaSlug,
                descricao: metadata.descricao || "Sem descrição.",
                imagem_url: metadata.imagem_url,
                link_serie: metadata.link_serie || url
              },
              create: {
                nome: metadata.nome,
                plataforma: plataformaSlug,
                descricao: metadata.descricao || "Sem descrição.",
                imagem_url: metadata.imagem_url,
                link_serie: metadata.link_serie || url
              }
            });

            await tx.userSerie.upsert({
              where: { 
                unique_user_produto: { 
                  user_id: grupo.user_id, // Vincula ao ADMIN dono do grupo
                  produto_id: produto.id 
                } 
              },
              update: { preco: valor, grupo_id: grupo.id, ativo: true },
              create: { 
                user_id: grupo.user_id, 
                produto_id: produto.id, 
                grupo_id: grupo.id, 
                preco: valor, 
                ativo: true 
              }
            });
          });

          resultados.sucessos.push(metadata.nome);
        } catch (err) {
          console.error(`Erro ao processar ${url}:`, err.message);
          resultados.falhas.push(`\`${url.split('/').pop()}\`: ${err.message}`);
        }

        // Pequena pausa para não ser bloqueado pelas plataformas
        if (listaLinks.length > 1) await delay(800);
      }

      // 3. Relatório Final
      const embed = new EmbedBuilder()
        .setTitle("📊 Relatório: Registro em Massa")
        .setDescription(`Processamento finalizado para o grupo **${grupo.nome}**.`)
        .setColor(resultados.falhas.length > 0 ? "#FFA500" : "#00FF00")
        .addFields(
          { name: `✅ Sucessos (${resultados.sucessos.length})`, value: truncate(resultados.sucessos.join("\n") || "Nenhum") },
          { name: `❌ Falhas (${resultados.falhas.length})`, value: truncate(resultados.falhas.join("\n") || "Nenhuma") }
        )
        .setFooter({ text: `Plataforma: ${plataformaSlug.toUpperCase()}` })
        .setTimestamp();

      await interaction.editReply({ content: "✅ Registro em massa concluído!", embeds: [embed] });

    } catch (error) {
      console.error("Erro crítico no registrar-massa:", error);
      await interaction.editReply({ content: `❌ Erro crítico no sistema: ${error.message}` });
    }
  }
};