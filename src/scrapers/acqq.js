import axios from 'axios';
import * as cheerio from 'cheerio';

/**
 * Converte uma URL de imagem para Base64 para evitar bloqueios de hotlink.
 * @param {string} url 
 * @returns {Promise<string>}
 */
async function imageToBase64(url) {
    try {
        const response = await axios.get(url, { 
            responseType: 'arraybuffer',
            headers: { 'Referer': 'https://ac.qq.com/' } 
        });
        const buffer = Buffer.from(response.data, 'binary');
        const contentType = response.headers['content-type'];
        return `data:${contentType};base64,${buffer.toString('base64')}`;
    } catch (error) {
        console.error("Erro ao converter imagem para Base64:", error.message);
        return url; // Retorna a URL original em caso de falha
    }
}

/**
 * Função principal de Scraping para ac.qq.com
 * @param {string} url - URL da página de informações da obra
 */
export async function scrape(url) {
    try {
        const { data } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        const $ = cheerio.load(data);

        // Seletores baseados na estrutura da AC.QQ
        const nome = $('.works-intro-title strong').text().trim();
        const descricao = $('.works-intro-short').text().trim();
        const capaUrl = $('.works-cover img').attr('src');

        if (!nome) {
            throw new Error("Não foi possível encontrar o título da obra.");
        }

        // Conversão da imagem para Base64 (Obrigatório para AC.QQ no Discord)
        const imagem_base64 = capaUrl ? await imageToBase64(capaUrl) : null;

        return {
            nome: nome,
            descricao: descricao || "Sem descrição disponível.",
            imagem_url: imagem_base64,
            link_serie: url
        };

    } catch (error) {
        console.error(`Erro no scraper ACQQ: ${error.message}`);
        throw new Error("Falha ao processar link da AC.QQ. Verifique se o link está correto.");
    }
}

// Exportação padrão para garantir compatibilidade com o seu comando
export default { scrape };