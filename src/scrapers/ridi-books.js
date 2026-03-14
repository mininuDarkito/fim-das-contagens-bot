import axios from "axios";
import * as cheerio from "cheerio";

export async function scrape(url) {
  try {
    const { data: html } = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
      }
    });

    const $ = cheerio.load(html);

    // 1. Extração e Limpeza do Título
    // Ex: "싸움개의 구애법 - 리디에만 있는 독점 작품!" -> "싸움개의 구애법"
    const ogTitle = $('meta[property="og:title"]').attr('content') || "";
    const nomeLimpo = ogTitle.split(' - ')[0].trim();

    // 2. Extração da Descrição
    const descricao = $('meta[property="og:description"]').attr('content') || null;

    // 3. Caçador da Capa de Alta Resolução (xxlarge + xxhdpi)
    let imagemFinal = null;
    
    // Tentamos encontrar a imagem que tem o alt igual ao título (comum na capa da Ridi)
    const capaImg = $('img').filter((i, el) => $(el).attr('alt') === nomeLimpo).first();
    const srcSet = capaImg.attr('srcset') || capaImg.attr('srcSet');

    if (srcSet) {
      // O srcSet da Ridi é uma lista separada por vírgulas. 
      // Queremos a URL que contém 'xxlarge' e 'xxhdpi'
      const urls = srcSet.split(',').map(s => s.trim().split(' ')[0]);
      const highRes = urls.find(u => u.includes('xxlarge') && u.includes('xxhdpi'));
      
      if (highRes) {
        // Remove o fragmento #1 ou similares que a Ridi coloca no fim da URL
        imagemFinal = highRes.split('#')[0];
      }
    }

    // Fallback: Se não achar no srcSet, tenta construir ou pegar do og:image
    if (!imagemFinal) {
      imagemFinal = $('meta[property="og:image"]').attr('content')?.split('#')[0];
    }

    return {
      nome: nomeLimpo || "Título não encontrado",
      descricao: descricao,
      imagem_url: imagemFinal || null,
      nome_alternativo: null 
    };
  } catch (error) {
    throw new Error(`Erro ao acessar Ridi Books: ${error.message}`);
  }
}