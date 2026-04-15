const axios = require('axios');
const SUPABASE_STORAGE_URL = 'https://wcifxyvesmhqurqhnway.supabase.co/storage/v1/object/public/cache';

const fetchFreshData = async (empresa, obra, mes, corretor_id, cacheKey) => {
  try {
    const fileName = `${empresa}-${obra}-${mes}.json`;
    const url = `${SUPABASE_STORAGE_URL}/${fileName}`;
    
    console.log('Fetching:', url);
    const response = await axios.get(`${url}?t=${new Date().getTime()}`, { timeout: 15000 });
    let resultData = response.data;
    
    if (corretor_id && resultData.dados) {
      resultData.dados = resultData.dados.filter(d => d.codigo_corretor === parseInt(corretor_id));
      resultData.total_corretores = resultData.dados.length;
    }
    return resultData;
  } catch (err) {
    console.error(err.message);
  }
}

fetchFreshData(13, '70100', 'all', null, 'dummy').then(d => {
  console.log('Total:', d?.total_corretores);
  console.log('Dados length:', d?.dados?.length);
});
