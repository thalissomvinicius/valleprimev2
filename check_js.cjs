const axios = require('axios');
axios.get('https://valleprimev2.pages.dev').then(res => {
  const match = res.data.match(/src="\/assets\/index-([^"].*?)\.js"/);
  if (match) {
    const url = 'https://valleprimev2.pages.dev/assets/index-' + match[1] + '.js';
    console.log('Fetching', url);
    axios.get(url).then(r2 => {
        if (r2.data.includes('wcifxyvesmhqurqhnway')) console.log('NEW URL FOUND');
        else if (r2.data.includes('onrender.com')) console.log('OLD URL FOUND');
        else console.log('NO URL FOUND');
    });
  } else {
    console.log('No index js found');
  }
});
