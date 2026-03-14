import axios from "axios";
import * as cheerio from "cheerio";

export async function scrape(url) {
  try {
    const { data: html } = await axios.get(url, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
        'Accept-Language': 'ja-JP,ja;q=0.9'
      }
    });

    const $ = cheerio.load(html);

    // 1. Capturar o título bruto
    let tituloBruto = $('meta[property="og:title"]').attr('content') || $('title').text();

    // 2. Limpeza do Título:
    // Remove o que estiver entre 【 】 (ex: 【3話無料】)
    // Remove o sufixo " - めちゃコミック"
    let nomeLimpo = tituloBruto
      .replace(/【.*?】/g, '') // Remove o colchete e o conteúdo dentro
      .split(' - ')[0]        // Pega apenas a primeira parte antes do traço
      .trim();                // Remove espaços extras

    return {
      nome: nomeLimpo,
      descricao: $('meta[property="og:description"]').attr('content') || null,
      // Usando twitter:image conforme seu exemplo, pois a imagem costuma ser melhor
      imagem_url: $('meta[name="twitter:image"]').attr('content') || $('meta[property="og:image"]').attr('content') || null,
      nome_alternativo: null 
    };
  } catch (error) {
    throw new Error(`Erro ao acessar Mechacomic: ${error.message}`);
  }
}