import axios from "axios";
import * as cheerio from "cheerio";

export async function scrape(url) {
  const { data: html } = await axios.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const $ = cheerio.load(html);

  // Aqui você pode ser específico para o layout da Kakao
  return {
    nome: $('meta[property="og:title"]').attr('content') || $('title').text(),
    descricao: $('meta[property="og:description"]').attr('content'),
    imagem_url: $('meta[property="og:image"]').attr('content'),
    nome_alternativo: null // Se a Kakao tiver uma classe específica para nome alt, pegue aqui
  };
}