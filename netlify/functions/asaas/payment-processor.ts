import { SupabaseClient } from '@supabase/supabase-js';
import { AsaasCustomerRequest, SupabasePaymentData } from './types';
import { createAsaasCustomer, createAsaasPayment, getAsaasPixQrCode } from './asaas-api';
import { savePaymentData, updateOrderAsaasPaymentId } from './supabase-operations';

// Função para processar o pagamento com a chave API fornecida
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
    // 🔵 Opcional: usar email temporário se configurado no Supabase
    const { data: emailConfig } = await supabase
      .from('asaas_email_config')
      .select('use_temp_email, temp_email')
      .single();
      
    if (emailConfig?.use_temp_email && emailConfig?.temp_email) {
      console.log('✉️ Substituindo email do cliente pelo temporário:', emailConfig.temp_email);
      requestData.email = emailConfig.temp_email;
    }
    
    // 1. Criar cliente no Asaas
    const customer = await createAsaasCustomer(requestData, apiKey, apiUrl);
    console.log('✅ Cliente criado:', customer);

    // 2. Criar pagamento PIX
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

    // 3. Obter QR Code PIX
    const pixQrCode = await getAsaasPixQrCode(payment.id, apiKey, apiUrl);
    console.log('✅ QR Code PIX recebido:', {
      success: pixQrCode.success,
      payloadLength: pixQrCode.payload?.length || 0,
      encodedImageLength: pixQrCode.encodedImage?.length || 0
    });
// 4. Save payment data to Supabase
const paymentData: SupabasePaymentData = {
  order_id: requestData.orderId,
  payment_id: payment.id,
  status: payment.status,
  amount: requestData.value,
  qr_code: pixQrCode.payload,
  qr_code_image: pixQrCode.encodedImage,
  copy_paste_key: pixQrCode.payload, // <--- corrigido aqui
  expiration_date: pixQrCode.expirationDate
};

const saveResult = await savePaymentData(supabase, paymentData);
console.log('Dados salvos no Supabase:', saveResult);

// 5. Update order with Asaas payment ID
await updateOrderAsaasPaymentId(supabase, requestData.orderId, payment.id);

// Return formatted response data
return {
  customer,
  payment,
  pixQrCode,
  paymentData: saveResult,
  qrCodeImage: pixQrCode.encodedImage,
  qrCode: pixQrCode.payload,
  copyPasteKey: pixQrCode.payload, // <--- corrigido aqui também
  expirationDate: pixQrCode.expirationDate
};


  } catch (error) {
    console.error('❌ Erro detalhado no fluxo de pagamento:', error);
    throw error;
  }
}
