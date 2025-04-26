import { PaymentStatus } from '@/types/checkout';

interface PaymentStatusResponse {
  status: PaymentStatus;
  error?: string;
}

interface BillingData {
  customer: {
    name: string;
    cpfCnpj: string;
    email: string;
    phone: string;
  };
  orderId: string;
  value: number | string;
  description?: string;
}

interface FormattedData {
  name: string;
  cpfCnpj: string;
  email: string;
  phone: string;
  orderId: string;
  value: number;
  description: string;
  [key: string]: string | number;
}

export const checkPaymentStatus = async (paymentId: string): Promise<PaymentStatus | PaymentStatusResponse> => {
  try {
    console.log(`Verificando status do pagamento: ${paymentId}`);

    const url = `/api/check-payment-status?paymentId=${paymentId}&t=${Date.now()}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      }
    });

    if (!response.ok) {
      console.error(`Erro na resposta da API: ${response.status} ${response.statusText}`);
      throw new Error(`Erro ao verificar status: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    console.log(`Status do pagamento ${paymentId} recebido:`, data);

    if (!data.status || typeof data.status !== 'string') {
      console.warn('Status inválido recebido da API:', data);
      return 'PENDING';
    }

    let normalizedStatus: PaymentStatus = data.status as PaymentStatus;

    if (normalizedStatus === 'RECEIVED') {
      console.log('Remapeando status RECEIVED para CONFIRMED');
      normalizedStatus = 'CONFIRMED';
    }

    return normalizedStatus;
  } catch (error) {
    console.error('Erro ao verificar status do pagamento:', error);
    return 'PENDING';
  }
};

export const generatePixPayment = async (billingData: BillingData) => {
  try {
    console.log('Generating PIX payment with data:', billingData);

    let numericValue: number;
    if (typeof billingData.value === 'string') {
      numericValue = parseFloat(billingData.value.replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
    } else if (typeof billingData.value === 'number') {
      numericValue = isNaN(billingData.value) ? 0 : billingData.value;
    } else {
      numericValue = 0;
    }

    const formattedData: FormattedData = {
      name: billingData.customer.name,
      cpfCnpj: billingData.customer.cpfCnpj.replace(/[^0-9]/g, ''),
      email: billingData.customer.email,
      phone: billingData.customer.phone.replace(/[^0-9]/g, ''),
      orderId: billingData.orderId,
      value: numericValue,
      description: billingData.description || `Pedido #${billingData.orderId || 'novo'}`
    };

    const response = await fetch('/api/create-asaas-customer', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(formattedData),
    });

    console.log('Response status:', response.status);

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Error response from server:', errorText);
      throw new Error(`Failed to generate PIX payment: ${response.status}`);
    }

    const responseData = await response.json();
    console.log('API response data:', responseData);

    let validQrCodeImage = responseData.qrCodeImage || '';

    if (validQrCodeImage && !validQrCodeImage.startsWith('data:image')) {
      console.warn('QR code image is not in the expected format, attempting to fix');
      if (validQrCodeImage.match(/^[A-Za-z0-9+/=]+$/)) {
        validQrCodeImage = `data:image/png;base64,${validQrCodeImage}`;
        console.log('Fixed QR code image by adding proper prefix');
      } else {
        console.error('QR code image could not be fixed, it will not be displayed');
        validQrCodeImage = '';
      }
    }

    const safeResponseData = {
      ...responseData,
      qrCodeImage: validQrCodeImage,
      qrCode: responseData.qrCode || '',
      copyPasteKey: responseData.copyPasteKey || '',
      expirationDate: responseData.expirationDate || new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      paymentId: responseData.paymentId || responseData.payment?.id || '',
      value: typeof responseData.value === 'number' ? responseData.value : parseFloat(responseData.value) || numericValue,
      status: responseData.status || 'PENDING',
    };

    return safeResponseData;
  } catch (error) {
    console.error('Error generating PIX payment:', error);
    throw error;
  }
};
