import { SupabaseClient } from '@supabase/supabase-js';
import { AsaasCustomerRequest, SupabasePaymentData } from './types';
import { createAsaasCustomer, createAsaasPayment, getAsaasPixQrCode } from './asaas-api';
import { savePaymentData, updateOrderAsaasPaymentId } from './supabase-operations';

export async function processPaymentFlow(
  requestData: AsaasCustomerRequest,
  apiKey: string,
  supabase: SupabaseClient,
  apiUrl: string = 'https://sandbox.asaas.com/api/v3'
) {
  console.log(`🚀 Iniciando fluxo de pagamento com API URL: ${apiUrl}`);
  console.log(`💰 Valor do pagamento: ${requestData.value}`);

  if (!apiKey) {
    console.error('❌ Chave API do Asaas não fornecida');
    throw new Error('Chave API do Asaas não configurada corretamente');
  }

  try {
    // 🔵 1. Verifica se existe configuração de email temporário
    const { data: emailConfig } = await supabase
      .from('asaas_email_config')
      .select('use_temp_email, temp_email')
      .single();

    if (emailConfig?.use_temp_email && emailConfig?.temp_email) {
      console.log('✉️ Substituindo email do cliente por email temporário:', emailConfig.temp_email);
      requestData.email = emailConfig.temp_email;
    }

    // ✅ 2. Cria o cliente no Asaas
    const customer = await createAsaasCustomer(requestData, apiKey, apiUrl);
    console.log('✅ Cliente criado:', customer);

    // ✅ 3. Cria o pagamento PIX
    const description = requestData.description || `Pedido #${requestData.orderId}`;
    const payment = await createAsaasPayment(
      customer.id,
      requestData.value,
      description,
      requestData.orderId,
      apiKey,
      apiUrl
    );
    console.log('✅ Pagamento criado:', payment);

    // ✅ 4. Obtém o QR Code do pagamento
    const pixQrCode = await getAsaasPixQrCode(payment.id, apiKey, apiUrl);
    console.log('✅ QR Code recebido:', {
      success: pixQrCode.success,
      payloadLength: pixQrCode.payload?.length || 0,
      encodedImageLength: pixQrCode.encodedImage?.length || 0
    });

    // ⚠️ Validação: Garantir que o payload (copia e cola) é válido
    if (!pixQrCode.payload || pixQrCode.payload.length < 10) {
      console.error('⚠️ QR Code payload inválido:', pixQrCode.payload);
      throw new Error('QR Code inválido recebido do Asaas.');
    }

    // ✅ 5. Salva os dados no Supabase
    const paymentData: SupabasePaymentData = {
      order_id: requestData.orderId,
      payment_id: payment.id,
      status: payment.status,
      amount: requestData.value,
      qr_code: pixQrCode.payload,
      qr_code_image: pixQrCode.encodedImage,
      copy_paste_key: pixQrCode.payload,
      expiration_date: pixQrCode.expirationDate
    };

    const saveResult = await savePaymentData(supabase, paymentData);
    console.log('💾 Dados salvos no Supabase:', saveResult);

    // ✅ 6. Atualiza a ordem com ID do pagamento
    const updateOrderResult = await updateOrderAsaasPaymentId(supabase, requestData.orderId, payment.id);
    console.log('🔄 Pedido atualizado com ID de pagamento:', updateOrderResult);

    // 🎯 7. Retorna os dados finais
    return {
      customer,
      payment,
      pixQrCode,
      paymentData: saveResult,
      qrCodeImage: pixQrCode.encodedImage,
      qrCode: pixQrCode.payload,
      copyPasteKey: pixQrCode.payload,
      expirationDate: pixQrCode.expirationDate
    };
  } catch (error) {
    console.error('❌ Erro detalhado no fluxo de pagamento:', error);
    throw error;
  }
}
