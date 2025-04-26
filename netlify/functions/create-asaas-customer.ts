import { Handler, HandlerEvent } from '@netlify/functions';
import { supabase } from './services/supabaseClientService';
import { AsaasCustomerRequest } from './asaas/types';
import { processPaymentFlow } from './asaas/payment-processor';
import { getAsaasApiKey } from './services/asaasKeyService';

const handler: Handler = async (event: HandlerEvent) => {
  // Verificação do método HTTP
  if (event.httpMethod !== 'POST') {
    console.error('Método não permitido, esperado POST');
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  // Verificação do corpo da requisição
  if (!event.body) {
    console.error('Corpo da requisição não fornecido');
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Corpo da requisição não fornecido' }),
    };
  }

  try {
    // Parse do corpo da requisição
    const requestData: AsaasCustomerRequest = JSON.parse(event.body);
    console.log('Solicitação recebida:', JSON.stringify(requestData, null, 2));

    // Verificar se todos os campos obrigatórios estão presentes
    const requiredFields = ['name', 'cpfCnpj', 'email', 'phone', 'orderId', 'value'];
    const missingFields = requiredFields.filter(field => !requestData[field]);
    if (missingFields.length > 0) {
      console.error('Campos obrigatórios faltando:', missingFields.join(', '));
      return {
        statusCode: 400,
        body: JSON.stringify({ error: `Campos obrigatórios faltando: ${missingFields.join(', ')}` }),
      };
    }

    // Determinar o ambiente (sandbox ou produção)
    const useProduction = process.env.USE_ASAAS_PRODUCTION === 'true';
    console.log(`🔵 Ambiente detectado: ${useProduction ? 'Produção' : 'Sandbox'}`);

    const isSandbox = !useProduction;
    const apiBaseUrl = isSandbox 
      ? 'https://sandbox.asaas.com/api/v3' 
      : 'https://api.asaas.com/v3';

    console.log(`Ambiente: ${isSandbox ? 'Sandbox' : 'Produção'}, URL da API: ${apiBaseUrl}`);

    // Obter a chave da API
    const apiKey = await getAsaasApiKey(isSandbox);
    if (!apiKey) {
      console.error(`Nenhuma chave ${isSandbox ? 'sandbox' : 'produção'} encontrada`);
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'API key not configured' }),
      };
    }

    console.log(`Chave API obtida com sucesso: ${apiKey.substring(0, 8)}...`);

    // Processar o fluxo de pagamento
    const result = await processPaymentFlow(
      requestData,
      apiKey,
      supabase,
      apiBaseUrl
    );

    // Logar o resultado do processamento de pagamento
    console.log('Resultado do processamento de pagamento:', JSON.stringify(result, null, 2));

    return {
      statusCode: 200,
      body: JSON.stringify(result),
    };
  } catch (error) {
    // Log de erro detalhado com stack trace
    console.error('Erro no processamento:', error.stack || error);
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
