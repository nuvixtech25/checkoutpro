
import { Handler, HandlerEvent } from '@netlify/functions';
import { supabase } from './asaas/supabase-client';
import { AsaasCustomerRequest } from './asaas/types';
import { validateAsaasCustomerRequest } from './asaas/validation';
import { processPaymentFlow } from './asaas/payment-processor';
import { getAsaasApiKey } from '../src/services/asaasKeyService';

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  try {
    const requestData: AsaasCustomerRequest = JSON.parse(event.body || '{}');
    console.log('Solicitação recebida:', requestData);

    // Validation
    const validationError = validateAsaasCustomerRequest(requestData);
    if (validationError) {
      console.error('Erro de validação:', validationError);
      return {
        statusCode: 400,
        body: JSON.stringify({ error: validationError }),
      };
    }

    // Determine environment
    const useProduction = process.env.USE_ASAAS_PRODUCTION === 'true';
    const isSandbox = !useProduction;
    const apiBaseUrl = isSandbox 
      ? 'https://sandbox.asaas.com/api/v3' 
      : 'https://api.asaas.com/v3';
      
    console.log(`Ambiente: ${isSandbox ? 'Sandbox' : 'Produção'}`);
    
    // Obter a chave API com mecanismo de fallback
    const apiKey = await getAsaasApiKey(isSandbox);
    
    if (!apiKey) {
      console.error(`Nenhuma chave ${isSandbox ? 'sandbox' : 'produção'} encontrada`);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'API key not configured' }),
      };
    }
    
    console.log(`Chave API obtida com sucesso: ${apiKey.substring(0, 8)}...`);
    
    // Process payment with the obtained API key
    const result = await processPaymentFlow(
      requestData,
      apiKey,
      supabase,
      apiBaseUrl
    );
    
    return {
      statusCode: 200,
      body: JSON.stringify(result),
    };
  } catch (error) {
    console.error('Erro no processamento:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: 'Falha no processamento do pagamento',
        details: error.message
      }),
    };
  }
};

export { handler };