import { SlashCommandBuilder, PermissionFlagsBits } from "discord.js";
import prisma from "../../prisma/client.js";
import path from "path";
import fs from "fs";

export default {
  data: new SlashCommandBuilder()
    .setName("registrarprodutoautomatico")
    .setDescription("ADMIN: Regista um produto global no grupo atual via scraper.")
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages)
    .addStringOption(o => 
      o.setName("plataforma")
        .setDescription("Escolha o scraper")
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

    await interaction.deferReply({ ephemeral: true });

    // --- 1. NORMALIZAÇÃO DE LINK (Ex: AC.QQ) ---
    if (plataformaSlug === 'acqq' || url.includes('ac.qq.com')) {
      if (url.includes('ComicView')) {
        const matchId = url.match(/\/id\/(\d+)/);
        if (matchId && matchId[1]) {
          url = `https://ac.qq.com/Comic/comicInfo/id/${matchId[1]}`;
        }
      }
    }

    const pathScript = path.join(process.cwd(), `src/scrapers/${plataformaSlug}.js`);
    if (!fs.existsSync(pathScript)) {
      return interaction.editReply(`❌ Scraper não encontrado para \`${plataformaSlug}\`.`);
    }

    try {
      // 2. BUSCA O GRUPO GLOBAL
      const grupo = await prisma.grupo.findUnique({ where: { channel_id: interaction.channelId } });
      if (!grupo) return interaction.editReply("❌ Este canal não está registrado como um Grupo Global.");

      // 3. EXECUÇÃO DO SCRAPER
      const scraperModule = await import(`file://${pathScript}`);
      const scrapeFunc = scraperModule.scrape || (scraperModule.default && scraperModule.default.scrape) || scraperModule.default;

      if (typeof scrapeFunc !== 'function') {
        throw new Error(`Scraper inválido.`);
      }

      const metadata = await scrapeFunc(url);
      if (!metadata || !metadata.nome) {
        return interaction.editReply("❌ O scraper falhou ao extrair dados.");
      }

      // 4. UPSERT DO PRODUTO (Tabela Global de Obras)
      const produto = await prisma.produto.upsert({
        where: { nome: metadata.nome },
        update: {
          plataforma: plataformaSlug.replace(/-/g, ' '),
          descricao: metadata.descricao || "Sem descrição.",
          imagem_url: metadata.imagem_url, 
          link_serie: metadata.link_serie || url
        },
        create: {
          nome: metadata.nome,
          plataforma: plataformaSlug.replace(/-/g, ' '),
          descricao: metadata.descricao || "Sem descrição.",
          imagem_url: metadata.imagem_url,
          link_serie: metadata.link_serie || url
        }
      });

      // 5. VÍNCULO DA OBRA AO GRUPO (Tabela UserSerie)
      // Usamos o user_id do DONO do grupo (você) para definir o preço global deste canal
      await prisma.userSerie.upsert({
        where: { 
          unique_user_produto: { 
            user_id: grupo.user_id, 
            produto_id: produto.id 
          } 
        },
        update: { 
          preco: valor, 
          grupo_id: grupo.id, 
          ativo: true 
        },
        create: { 
          user_id: grupo.user_id, 
          produto_id: produto.id, 
          grupo_id: grupo.id, 
          preco: valor, 
          ativo: true 
        }
      });

      await interaction.editReply({
        content: `✅ **Obra Registrada no Grupo Global!**\n📖 **Nome:** ${metadata.nome}\n💰 **Preço Unitário:** R$ ${valor.toFixed(2)}\n📍 **Canal:** ${grupo.nome}`
      });

    } catch (error) {
      console.error(error);
      interaction.editReply(`❌ Erro: ${error.message}`);
    }
  }
};