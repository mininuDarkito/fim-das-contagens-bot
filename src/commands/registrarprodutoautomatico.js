import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from "discord.js";
import prisma from "../../prisma/client.js";
import path from "path";
import fs from "fs";

export default {
  data: new SlashCommandBuilder()
    .setName("registrarprodutoautomatico")
    .setDescription("YAKUZA: Registra um produto global via scraper no grupo atual.")
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

    try {
      // 1. Validação de Role e Grupo
      const user = await prisma.user.findUnique({ where: { discord_id: interaction.user.id } });
      if (!user || user.role !== 'admin') {
        return interaction.editReply("❌ **Acesso Negado:** Apenas administradores da Yakuza Raws podem registrar obras globais.");
      }

      const grupo = await prisma.grupo.findUnique({ where: { channel_id: interaction.channelId } });
      if (!grupo) return interaction.editReply("❌ Este canal não é um **Grupo Global** registrado.");

      // 2. Normalização e Verificação de Scraper
      if (plataformaSlug === 'acqq' || url.includes('ac.qq.com')) {
        if (url.includes('ComicView')) {
          const matchId = url.match(/\/id\/(\d+)/);
          if (matchId && matchId[1]) url = `https://ac.qq.com/Comic/comicInfo/id/${matchId[1]}`;
        }
      }

      const pathScript = path.join(process.cwd(), `src/scrapers/${plataformaSlug}.js`);
      if (!fs.existsSync(pathScript)) return interaction.editReply(`❌ Scraper \`${plataformaSlug}\` não encontrado.`);

      // 3. Execução do Scraper
      const scraperModule = await import(`file://${pathScript}`);
      const scrapeFunc = scraperModule.scrape || (scraperModule.default && scraperModule.default.scrape) || scraperModule.default;

      const metadata = await scrapeFunc(url);
      if (!metadata || !metadata.nome) return interaction.editReply("❌ O scraper falhou ao extrair dados da obra.");

      // 4. Upsert do Produto e Vínculo (Transação para Segurança)
      const resultado = await prisma.$transaction(async (tx) => {
        const produto = await tx.produto.upsert({
          where: { nome: metadata.nome },
          update: {
            plataforma: plataformaSlug.toUpperCase(),
            descricao: metadata.descricao || "Sem descrição.",
            imagem_url: metadata.imagem_url, 
            link_serie: metadata.link_serie || url,
            updated_at: new Date()
          },
          create: {
            nome: metadata.nome,
            plataforma: plataformaSlug.toUpperCase(),
            descricao: metadata.descricao || "Sem descrição.",
            imagem_url: metadata.imagem_url,
            link_serie: metadata.link_serie || url
          }
        });

        const vinculo = await tx.userSeries.upsert({
          where: { 
            unique_user_produto_grupo: { 
              user_id: user.id, // O Admin que executou o comando
              produto_id: produto.id,
              grupo_id: grupo.id
            } 
          },
          update: { preco: valor, ativo: true, updated_at: new Date() },
          create: { 
            user_id: user.id, 
            produto_id: produto.id, 
            grupo_id: grupo.id, 
            preco: valor, 
            ativo: true 
          }
        });

        return { produto, vinculo };
      });

      // 5. Log de Atividade
      await prisma.activityLog.create({
        data: {
          user_id: user.id,
          action: "auto_register_product",
          entity_type: "produto",
          entity_id: resultado.produto.id,
          details: { obra: metadata.nome, grupo: grupo.nome, plataforma: plataformaSlug }
        }
      });

      // 6. Resposta Visual Yakuza Raws
      const embed = new EmbedBuilder()
        .setTitle("🏮 Obra Integrada à Yakuza Raws")
        .setColor("#FF0000") // Vermelho Yakuza
        .setThumbnail(metadata.imagem_url || null)
        .addFields(
          { name: "📖 Nome", value: `**${metadata.nome}**`, inline: false },
          { name: "💰 Valor/Cap", value: `R$ ${valor.toFixed(2)}`, inline: true },
          { name: "📍 Grupo", value: grupo.nome, inline: true },
          { name: "📱 Plataforma", value: plataformaSlug.toUpperCase(), inline: true }
        )
        .setFooter({ text: "Yakuza Raws • Automação de Catálogo" })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error("Erro no registro automático:", error);
      interaction.editReply(`❌ **Erro Interno:** ${error.message}`);
    }
  }
};