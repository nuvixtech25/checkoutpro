
import { Handler, HandlerEvent } from '@netlify/functions';
import { getAsaasApiKey, clearKeyCache } from './services/asaasKeyService';

const handler: Handler = async (event: HandlerEvent) => {
  // CORS Headers
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  // Handle OPTIONS request (CORS preflight)
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 204,
      headers,
      body: ''
    };
  }

  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  try {
    // Get query parameters
    const params = new URLSearchParams(event.rawQuery);
    const isSandbox = params.get('sandbox') === 'true';
    const resetCache = params.get('reset_cache') === 'true';

    if (resetCache) {
      clearKeyCache();
      console.log('Cache limpo');
    }

    // Test retrieval of API key
    console.log(`Testando obtenção de chave ${isSandbox ? 'sandbox' : 'produção'}`);
    const startTime = Date.now();
    
    // First call (should hit the database)
    const apiKey = await getAsaasApiKey(isSandbox);
    const firstCallTime = Date.now() - startTime;
    
    // Second call (should hit the cache)
    const cachedStartTime = Date.now();
    const cachedApiKey = await getAsaasApiKey(isSandbox);
    const cachedCallTime = Date.now() - cachedStartTime;
    
    // Test if we got the same key from both calls
    const sameKey = apiKey === cachedApiKey;
    
    // Only show first 8 characters of the key for security
    const maskedKey = apiKey ? `${apiKey.substring(0, 8)}...` : 'Não encontrada';
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        environment: isSandbox ? 'sandbox' : 'production',
        keyAvailable: !!apiKey,
        maskedKey,
        firstCallTime: `${firstCallTime}ms`,
        cachedCallTime: `${cachedCallTime}ms`,
        cachingWorking: sameKey,
        cacheHit: cachedCallTime < firstCallTime,
        timestamp: new Date().toISOString()
      }),
    };
  } catch (error) {
    console.error('Erro no teste de chaves:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Falha ao testar chaves API',
        details: error.message
      }),
    };
  }
};

export { handler };