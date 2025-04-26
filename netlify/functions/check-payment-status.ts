import { Handler } from '@netlify/functions';
import { createClient } from '@supabase/supabase-js';
import { getAsaasApiKey } from './services/asaasKeyService';

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      },
      body: JSON.stringify({ error: 'Método não permitido. Use GET.' }),
    };
  }

  const paymentId = event.queryStringParameters?.paymentId;

  if (!paymentId) {
    return {
      statusCode: 400,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      },
      body: JSON.stringify({ error: 'ID do pagamento não fornecido.' }),
    };
  }

  try {
    const supabaseUrl = process.env.SUPABASE_URL || '';
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('🔴 Credenciais do Supabase não configuradas');
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        },
        body: JSON.stringify({ error: 'Erro de configuração do servidor' }),
      };
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Detectar ambiente
    const useProduction = process.env.USE_ASAAS_PRODUCTION === 'true';
    console.log(`🔵 Ambiente detectado: ${useProduction ? 'Produção' : 'Sandbox'}`);

    const asaasApiKey = await getAsaasApiKey(!useProduction);
    const apiUrl = useProduction
      ? 'https://www.asaas.com/api/v3'
      : 'https://sandbox.asaas.com/api/v3';

    if (!asaasApiKey) {
      console.error('🔴 Nenhuma chave API encontrada');
      return {
        statusCode: 500,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        },
        body: JSON.stringify({ error: 'Chave API não configurada' }),
      };
    }

    console.log(`🟢 Usando API URL: ${apiUrl}`);

    const response = await fetch(`${apiUrl}/payments/${paymentId}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'access_token': asaasApiKey,
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      }
    });

    if (!response.ok) {
      console.error(`🔴 Erro ao consultar pagamento: ${response.status} - ${response.statusText}`);
      const errorText = await response.text();
      console.error('Detalhe erro Asaas:', errorText);

      return {
        statusCode: response.status,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache, no-store, must-revalidate'
        },
        body: JSON.stringify({ error: 'Erro ao consultar pagamento no Asaas', details: errorText }),
      };
    }

    const paymentData = await response.json();
    console.log('🟢 Dados do pagamento recebidos:', paymentData);

    const { status } = paymentData;

    const { data: paymentRecord, error: findError } = await supabase
      .from('asaas_payments')
      .select('order_id')
      .eq('payment_id', paymentId)
      .single();

    if (findError) {
      console.warn('⚠️ Pagamento não encontrado no Supabase:', findError.message);
    } else if (paymentRecord) {
      await supabase
        .from('asaas_payments')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('payment_id', paymentId);

      await supabase
        .from('orders')
        .update({ status, updated_at: new Date().toISOString() })
        .eq('id', paymentRecord.order_id);

      console.log('🟢 Status atualizado no Supabase');
    }

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      },
      body: JSON.stringify({
        paymentId,
        status,
        updatedAt: new Date().toISOString()
      }),
    };
  } catch (error) {
    console.error('🔴 Erro inesperado na função:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate'
      },
      body: JSON.stringify({ error: error instanceof Error ? error.message : 'Erro interno desconhecido' }),
    };
  }
};
