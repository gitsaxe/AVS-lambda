'use strict';
const { route } = require('./app');

exports.handler = async (event) => {
  const method = (event.requestContext && event.requestContext.http && event.requestContext.http.method) || event.httpMethod || 'GET';
  const path = event.rawPath || event.path || '/';
  const query = event.queryStringParameters || {};
  try {
    return await route({ method, path, query });
  } catch (e) {
    console.error('UNHANDLED', e);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: '<p>Internal error.</p>',
    };
  }
};
