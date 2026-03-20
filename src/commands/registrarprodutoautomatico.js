import { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } from "discord.js";
import prisma from "../../prisma/client.js";
import path from "path";
import fs from "fs";

export default {
  data: new SlashCommandBuilder()
    .setName("registrarprodutoautomatico")
    .setDescription("YAKUZA: Registra uma obra global via scraper no grupo atual.")
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
      // 1. Identificação de Admin e Grupo
      const admin = await prisma.user.findUnique({ where: { discord_id: interaction.user.id } });
      if (!admin || admin.role !== 'admin') {
        return interaction.editReply("❌ **Acesso Negado:** Apenas administradores da Yakuza Raws podem gerenciar o catálogo global.");
      }

      const grupo = await prisma.grupo.findUnique({ where: { channel_id: interaction.channelId } });
      if (!grupo) return interaction.editReply("❌ Este canal não está registrado como um **Grupo Global** da Yakuza.");

      // 2. Verificação do Scraper
      const pathScript = path.join(process.cwd(), `src/scrapers/${plataformaSlug}.js`);
      if (!fs.existsSync(pathScript)) return interaction.editReply(`❌ Scraper \`${plataformaSlug}\` não encontrado.`);

      // 3. Execução do Scraper
      const scraperModule = await import(`file://${pathScript}`);
      const scrapeFunc = scraperModule.scrape || (scraperModule.default && scraperModule.default.scrape) || scraperModule.default;

      if (typeof scrapeFunc !== 'function') throw new Error("Scraper inválido ou função 'scrape' não exportada.");

      const metadata = await scrapeFunc(url);
      if (!metadata || !metadata.nome) return interaction.editReply("❌ O scraper falhou ao extrair dados da obra.");

      // 4. TRANSAÇÃO: Registro do Produto + Vínculo (Blindado)
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

        return { produto, vinculo };
      });

      // 5. Log de Atividade (Fora da transação para evitar 'Internal Error' em cascata)
      try {
        await prisma.activityLog.create({
          data: {
            user_id: admin.id,
            action: "auto_register_product",
            entity_type: "produto",
            entity_id: resultado.produto.id,
            details: { obra: metadata.nome, grupo: grupo.nome, plataforma: plataformaSlug }
          }
        });
      } catch (logError) {
        console.warn("⚠️ Log não pôde ser gravado, mas a obra foi registrada.");
      }

      // 6. Resposta Visual Yakuza Style (Roxo)
      const embed = new EmbedBuilder()
        .setTitle("🏮 Obra Integrada: Yakuza Raws")
        .setColor("#800080") // Roxo Yakuza
        .setThumbnail(metadata.imagem_url || null)
        .addFields(
          { name: "📖 Nome da Obra", value: `**${metadata.nome}**`, inline: false },
          { name: "💰 Preço/Cap", value: `R$ ${valor.toFixed(2)}`, inline: true },
          { name: "📍 Grupo Global", value: grupo.nome, inline: true }
        )
        .setFooter({ text: "Yakuza Raws • Automação de Catálogo" })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      console.error("❌ Erro no registro automático:", error);
      // Se cair aqui, o erro é do Prisma ou do Scraper
      const msgErro = error.message.includes("uuid") ? "Erro de ID (UUID) inválido no banco." : error.message;
      interaction.editReply(`❌ **Erro Interno:** ${msgErro}`);
    }
  }
};