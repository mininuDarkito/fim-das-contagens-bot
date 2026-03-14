import axios from "axios";
import * as cheerio from "cheerio";

export async function scrape(url) {
  try {
    const { data: html } = await axios.get(url, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36'
      }
    });

    const $ = cheerio.load(html);

    // 1. Extração e Limpeza do Título
    // Padrão: "Nome da Obra - Manhwa/Webcomic - Manta"
    let twitterTitle = $('meta[name="twitter:title"]').attr('content') || "";
    let nomeLimpo = twitterTitle.split(' - ')[0].trim();

    // 2. Extração da Imagem
    let imagem = $('meta[name="twitter:image"]').attr('content') || 
                 $('meta[property="og:image"]').attr('content');

    // 3. Extração e Limpeza da Sinopse
    let descBruta = $('meta[property="og:description"]').attr('content') || "";
    let sinopse = descBruta;

    // Tratamento para remover a introdução da Manta: 
    // "Read the latest, legitimate English translation of [Nome]."
    if (nomeLimpo && descBruta.includes(nomeLimpo)) {
      // Procuramos o primeiro ponto final após o nome da obra na descrição
      const partes = descBruta.split(`${nomeLimpo}.`);
      if (partes.length > 1) {
        // Pega tudo o que vem depois do "Nome da Obra."
        sinopse = partes.slice(1).join(`${nomeLimpo}.`).trim();
      }
    }

    return {
      nome: nomeLimpo || "Título não encontrado",
      descricao: sinopse,
      imagem_url: imagem || null,
      nome_alternativo: null 
    };
  } catch (error) {
    throw new Error(`Erro ao acessar Manta: ${error.message}`);
  }
}