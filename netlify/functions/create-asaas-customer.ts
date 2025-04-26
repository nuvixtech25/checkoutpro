import { Handler, HandlerEvent } from '@netlify/functions';
import { supabase } from './services/supabaseClientService';
import { AsaasCustomerRequest } from './asaas/types';
import { validateAsaasCustomerRequest } from './asaas/validation';
import { processPaymentFlow } from './asaas/payment-processor';
import { getAsaasApiKey } from './services/asaasKeyService';

const handler: Handler = async (event: HandlerEvent) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  try {
    if (!event.body) {
      console.error('Corpo da requisição não fornecido');
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Corpo da requisição não fornecido' }),
      };
    }

    const requestData = JSON.parse(event.body);
    console.log('Solicitação recebida:', requestData);

    // Nova Validação rápida:
    const requiredFields = ['name', 'cpfCnpj', 'email', 'phone', 'orderId', 'value'];
    const missingFields = requiredFields.filter(field => !requestData[field]);

    if (missingFields.length > 0) {
      console.error('Campos obrigatórios faltando:', missingFields);
      return {
        statusCode: 400,
        body: JSON.stringify({ error: `Campos obrigatórios faltando: ${missingFields.join(', ')}` }),
      };
    }

    // Segue seu código normal...
    const useProduction = process.env.USE_ASAAS_PRODUCTION === 'true';
    const isSandbox = !useProduction;
    const apiBaseUrl = isSandbox 
      ? 'https://sandbox.asaas.com/api/v3' 
      : 'https://api.asaas.com/v3';

    console.log(`Ambiente: ${isSandbox ? 'Sandbox' : 'Produção'}`);
    
    const apiKey = await getAsaasApiKey(isSandbox);

    if (!apiKey) {
      console.error(`Nenhuma chave ${isSandbox ? 'sandbox' : 'produção'} encontrada`);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'API key not configured' }),
      };
    }

    console.log(`Chave API obtida com sucesso: ${apiKey.substring(0, 8)}...`);

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
        details: error instanceof Error ? error.message : 'Unknown error',
      }),
    };
  }
};
