import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import prisma from "../../prisma/client.js";
import path from "path";
import fs from "fs";

export default {
  data: new SlashCommandBuilder()
    .setName("registrarprodutoautomatico")
    .setDescription("Regista um produto via link com normalização e scrapers.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(o => 
      o.setName("plataforma")
        .setDescription("Escolha a plataforma")
        .setAutocomplete(true)
        .setRequired(true)
    )
    .addStringOption(o => o.setName("link").setDescription("URL da obra").setRequired(true))
    .addNumberOption(o => o.setName("valor").setDescription("Preço para este grupo").setRequired(true)),

  async autocomplete(interaction) {
    const focusedValue = interaction.options.getFocused().toLowerCase();
    const scrapersPath = path.join(process.cwd(), "src/scrapers");

    if (!fs.existsSync(scrapersPath)) return interaction.respond([]);

    const files = fs.readdirSync(scrapersPath)
      .filter(f => f.endsWith(".js"))
      .map(f => f.replace(".js", ""));

    const filtered = files.filter(choice => choice.includes(focusedValue)).slice(0, 25);

    await interaction.respond(
      filtered.map(choice => ({ name: choice.replace(/-/g, ' ').toUpperCase(), value: choice }))
    );
  },

  async execute(interaction) {
    let url = interaction.options.getString("link");
    const plataformaSlug = interaction.options.getString("plataforma");
    const valor = interaction.options.getNumber("valor");

    // --- 1. NORMALIZAÇÃO DE LINK (AC.QQ) ---
    if (plataformaSlug === 'acqq' || url.includes('ac.qq.com')) {
      if (url.includes('ComicView')) {
        const matchId = url.match(/\/id\/(\d+)/);
        if (matchId && matchId[1]) {
          url = `https://ac.qq.com/Comic/comicInfo/id/${matchId[1]}`;
        }
      }
    }

    const pathScript = path.join(process.cwd(), `src/scrapers/${plataformaSlug}.js`);
    await interaction.deferReply({ ephemeral: true });

    if (!fs.existsSync(pathScript)) {
      return interaction.editReply(`❌ Scraper não encontrado para \`${plataformaSlug}\`.`);
    }

    try {
      const scraperModule = await import(`file://${pathScript}`);
      const scrapeFunc = scraperModule.scrape || (scraperModule.default && scraperModule.default.scrape) || scraperModule.default;

      if (typeof scrapeFunc !== 'function') {
        throw new Error(`O arquivo ${plataformaSlug}.js não exporta uma função 'scrape' válida.`);
      }

      const metadata = await scrapeFunc(url);

      if (!metadata || !metadata.nome) {
        return interaction.editReply("❌ O scraper não conseguiu extrair os dados da obra.");
      }

      const grupo = await prisma.grupo.findUnique({ where: { channel_id: interaction.channelId } });
      if (!grupo) return interaction.editReply("❌ Este canal não é um grupo registado.");

      const produto = await prisma.produto.upsert({
        where: { nome: metadata.nome },
        update: {
          plataforma: plataformaSlug.replace(/-/g, ' '),
          descricao: metadata.descricao || "Sem descrição disponível.",
          imagem_url: metadata.imagem_url, 
          link_serie: metadata.link_serie || url
        },
        create: {
          nome: metadata.nome,
          plataforma: plataformaSlug.replace(/-/g, ' '),
          descricao: metadata.descricao || "Sem descrição disponível.",
          imagem_url: metadata.imagem_url,
          link_serie: metadata.link_serie || url
        }
      });

      await prisma.userSerie.upsert({
        where: { unique_user_produto: { user_id: grupo.user_id, produto_id: produto.id } },
        update: { preco: valor, grupo_id: grupo.id, ativo: true },
        create: { user_id: grupo.user_id, produto_id: produto.id, grupo_id: grupo.id, preco: valor, ativo: true }
      });

      const isBase64 = metadata.imagem_url?.startsWith('data:');

      await interaction.editReply({
        content: `✅ **Registo Concluído!**\n📖 **Obra:** ${metadata.nome}\n🌐 **Plataforma:** ${plataformaSlug.toUpperCase()}\n🖼️ **Imagem:** ${isBase64 ? 'Convertida para Base64 (Anti-Hotlink)' : 'Link Direto'}\n💰 **Valor:** R$ ${valor.toFixed(2)}`
      });

    } catch (error) {
      console.error(error);
      interaction.editReply(`❌ Erro técnico: ${error.message}`);
    }
  }
};