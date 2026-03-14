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

    // 1. TRATAMENTO DO TÍTULO (Lógica aprimorada do TS)
    const ogTitle = $('meta[property="og:title"]').attr('content') || "";
    let nomeLimpo = ogTitle.split('|')[0]           // Tenta pelo pipe comum
                           .split('漫画｜')[0]      // Tenta pelo pipe estilizado
                           .split('官方在线')[0]    // Tenta pelo marcador de 'Online Oficial'
                           .replace(/漫画$/, '')    // Remove o sufixo 'Manga' no final
                           .trim();

    // 2. TRATAMENTO DA SINOPSE (Lógica de limpeza do prefixo)
    const ogDesc = $('meta[property="og:description"]').attr('content') || "";
    let descLimpa = ogDesc;
    
    // Remove o termo "简介：" (Sinopse:) e tudo que vem antes dele
    if (ogDesc.includes('简介：')) {
      descLimpa = ogDesc.split('简介：')[1]?.trim();
    }

    // 3. CAÇADOR DE IMAGEM REAL (Bypass Lazy-loading)
    let imagemReal = null;

    $('img').each((_, el) => {
      const src = $(el).attr('src');
      const dataSrc = $(el).attr('data-src');

      if (src && src.includes('kkmh.com')) {
        imagemReal = src;
        return false; // Break loop
      }
      if (dataSrc && dataSrc.includes('kkmh.com')) {
        imagemReal = dataSrc;
        return false; // Break loop
      }
    });

    // Fallback para a tag meta se não encontrar no corpo da página
    if (!imagemReal) {
      imagemReal = $('meta[property="og:image"]').attr('content') || null;
    }

    return {
      nome: nomeLimpo || "Título não encontrado",
      descricao: descLimpa || "Sem descrição disponível",
      imagem_url: imagemReal,
      plataforma: 'Kuaikan'
    };
  } catch (error) {
    throw new Error(`Erro ao acessar Kuaikan: ${error.message}`);
  }
}