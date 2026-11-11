import { checkBotId } from "botid/server";

/** True when BotID flags the current request as a bot. Always false in local development. */
export async function isBot(): Promise<boolean> {
  const verification = await checkBotId();
  return verification.isBot;
}

export const BOT_ERROR = "לא הצלחנו לאמת שהבקשה נשלחה מדפדפן רגיל. נסו שוב בעוד רגע.";
