export default {
  async fetch(request:any , env: any, ctx: any) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/aztec-crs/')) {
      const targetPath = url.pathname.replace(/^\/aztec-crs/, '');
      const targetUrl = new URL(targetPath, 'https://crs.aztec.network');

      let response = await fetch(new Request(targetUrl.toString(), request));
      response = new Response(response.body, response);
      response.headers.set('Access-Control-Allow-Origin', '*');
      
      return response;
    }

    return env.ASSETS.fetch(request);
  },
};