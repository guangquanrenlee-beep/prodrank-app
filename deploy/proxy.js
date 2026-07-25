export default {
  async fetch(request) {
    const url = new URL(request.url);
    const target = 'http://98.159.111.217' + url.pathname + url.search;

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': '*',
          'Access-Control-Max-Age': '86400',
        }
      });
    }

    const modified = new Request(target, {
      method: request.method,
      headers: request.headers,
      body: request.body,
    });

    let response = await fetch(modified);
    response = new Response(response.body, response);
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', '*');
    return response;
  }
}
