import axios from "axios";
import * as cheerio from "cheerio";

export async function scrape(url) {
  try {
    const { data: html } = await axios.get(url, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36',
        'Referer': 'https://www.kuaikanmanhua.com/',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      }
    });

    const $ = cheerio.load(html);

    // 1. Tratamento do Título (Pega apenas o nome antes do | )
    let ogTitle = $('meta[property="og:title"]').attr('content') || "";
    let nomeLimpo = ogTitle.split('|')[0].trim();
    nomeLimpo = nomeLimpo.replace(/漫画$/, '').trim();

    // 2. Caçador de Imagem Real (Ignora base64 e procura o CDN da KKMH)
    let imagemReal = null;

    // Vasculha TODAS as tags <img> da página
    $('img').each((i, el) => {
      const src = $(el).attr('src');
      const dataSrc = $(el).attr('data-src'); // Atributo comum em lazy-loading

      // Se o SRC ou DATA-SRC contiver o link do servidor de imagens da Kuaikan
      if (src && src.includes('kkmh.com')) {
        imagemReal = src;
        return false; // Para o loop ao encontrar a primeira
      }
      if (dataSrc && dataSrc.includes('kkmh.com')) {
        imagemReal = dataSrc;
        return false;
      }
    });

    // Fallback: Se não achou no corpo, tenta no meta og:image (geralmente é o link direto)
    if (!imagemReal) {
      imagemReal = $('meta[property="og:image"]').attr('content');
    }

    return {
      nome: nomeLimpo || "Título não encontrado",
      descricao: $('meta[property="og:description"]').attr('content') || null,
      imagem_url: imagemReal || null,
      nome_alternativo: null 
    };
  } catch (error) {
    throw new Error(`Erro ao acessar Kuaikan: ${error.message}`);
  }
}