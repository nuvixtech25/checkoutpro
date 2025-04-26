import { Handler, HandlerEvent } from '@netlify/functions';
import { supabase } from './services/supabaseClientService';
import { AsaasCustomerRequest } from './asaas/types';
import { processPaymentFlow } from './asaas/payment-processor';
import { getAsaasApiKey } from './services/asaasKeyService';

const handler: Handler = async (event: HandlerEvent) => {
  // Verifica se o método HTTP é POST
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  // Verifica se o body da requisição foi enviado
  if (!event.body) {
    console.error('Corpo da requisição não fornecido');
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Corpo da requisição não fornecido' }),
    };
  }

  try {
    // Parse do body recebido
    const requestData: AsaasCustomerRequest = JSON.parse(event.body);
    console.log('Solicitação recebida:', requestData);

    // Validação dos campos obrigatórios
    const requiredFields = ['name', 'cpfCnpj', 'email', 'phone', 'orderId', 'value'];
    const missingFields = requiredFields.filter(field => !requestData[field]);
    if (missingFields.length > 0) {
      console.error('Campos obrigatórios faltando:', missingFields);
      return {
        statusCode: 400,
        body: JSON.stringify({ error: `Campos obrigatórios faltando: ${missingFields.join(', ')}` }),
      };
    }

    // Determina o ambiente de operação
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

    // Processa o pagamento com a chave API obtida
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
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
    };
  }
};

export { handler };
