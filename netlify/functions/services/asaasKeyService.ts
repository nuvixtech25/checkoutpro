
// Re-export everything from the new key manager
// Correto:
export * from '../../../src/services/asaasKeyManager';

import { supabase } from '../../../src/integrations/supabase/client';
import { getActiveApiKey, AsaasApiKey } from '../../../src/services/asaasKeyManager';



/**
 * Estrutura para caching local de chaves
 */
interface KeyCache {
  sandbox: AsaasApiKey | null;
  production: AsaasApiKey | null;
  legacySandbox: string | null;
  legacyProduction: string | null;
  timestamp: number;
}

// Cache local para minimizar chamadas ao Supabase
// Expira após 5 minutos (300000ms)
const KEY_CACHE_EXPIRY = 300000;
let keyCache: KeyCache = {
  sandbox: null,
  production: null,
  legacySandbox: null,
  legacyProduction: null,
  timestamp: 0
};

/**
 * Obtém uma chave API do Asaas com fallback para o sistema legado
 * @param isSandbox se deve buscar uma chave sandbox ou produção
 * @param useCache se deve usar o cache local (default: true)
 * @returns a chave API ou null se não encontrada
 */
export const getAsaasApiKey = async (
  isSandbox: boolean, 
  useCache: boolean = true
): Promise<string | null> => {
  // Verificar o cache se solicitado
  const now = Date.now();
  const cacheValid = useCache && now - keyCache.timestamp < KEY_CACHE_EXPIRY;
  
  if (cacheValid) {
    if (isSandbox && keyCache.sandbox) {
      console.log('Usando chave sandbox em cache (novo sistema)');
      return keyCache.sandbox.api_key;
    } else if (!isSandbox && keyCache.production) {
      console.log('Usando chave produção em cache (novo sistema)');
      return keyCache.production.api_key;
    } else if (isSandbox && keyCache.legacySandbox) {
      console.log('Usando chave sandbox em cache (sistema legado)');
      return keyCache.legacySandbox;
    } else if (!isSandbox && keyCache.legacyProduction) {
      console.log('Usando chave produção em cache (sistema legado)');
      return keyCache.legacyProduction;
    }
  }
  
  // Tentar obter chave do novo sistema primeiro
  const activeKey = await getActiveApiKey(isSandbox);
  
  // Se encontrou uma chave no novo sistema, usa ela
  if (activeKey) {
    // Atualizar o cache
    if (isSandbox) {
      keyCache.sandbox = activeKey;
    } else {
      keyCache.production = activeKey;
    }
    keyCache.timestamp = now;
    
    console.log(`Usando chave do novo sistema: ${activeKey.key_name} (ID: ${activeKey.id})`);
    return activeKey.api_key;
  }
  
  // Fallback para o sistema legado
  console.log('Chave não encontrada no novo sistema, tentando sistema legado...');
  
  try {
    const { data: legacyConfig, error } = await supabase
      .from('asaas_config')
      .select('sandbox_key, production_key')
      .maybeSingle();
      
    if (error) throw error;
    
    if (!legacyConfig) {
      console.error('Nenhuma configuração encontrada no sistema legado');
      return null;
    }
    
    // Determinar qual chave usar
    const legacyKey = isSandbox ? legacyConfig.sandbox_key : legacyConfig.production_key;
    
    if (!legacyKey) {
      console.error(`Nenhuma chave ${isSandbox ? 'sandbox' : 'produção'} encontrada no sistema legado`);
      return null;
    }
    
    // Atualizar o cache
    if (isSandbox) {
      keyCache.legacySandbox = legacyKey;
    } else {
      keyCache.legacyProduction = legacyKey;
    }
    keyCache.timestamp = now;
    
    console.log('Usando chave do sistema legado');
    return legacyKey;
    
  } catch (error) {
    console.error('Erro ao buscar chave do sistema legado:', error);
    return null;
  }
};

/**
 * Limpa o cache local de chaves
 */
export const clearKeyCache = (): void => {
  keyCache = {
    sandbox: null,
    production: null,
    legacySandbox: null,
    legacyProduction: null,
    timestamp: 0
  };
  console.log('Cache de chaves API limpo');
};
