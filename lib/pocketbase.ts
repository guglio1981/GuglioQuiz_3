import PocketBase from 'pocketbase';

// We use a singleton instance for the client side.
let pbInstance: PocketBase | null = null;

export function getPocketBase() {
  if (!pbInstance) {
    const url = process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://127.0.0.1:8090';
    pbInstance = new PocketBase(url);
    
    // Disable auto cancellation to prevent request cancellation issues in React Strict Mode
    pbInstance.autoCancellation(false);

    // Exponential backoff for 429 errors
    const originalSend = pbInstance.send.bind(pbInstance);
    pbInstance.send = async function(path, options) {
      let retries = 0;
      const maxRetries = 3;
      const baseDelay = 1000;

      while (true) {
        try {
          return await originalSend(path, options);
        } catch (err: any) {
          if (err?.status === 429 && retries < maxRetries) {
            retries++;
            const delay = baseDelay * Math.pow(2, retries - 1);
            console.warn(`Rate limited (429). Retrying in ${delay}ms... (Attempt ${retries}/${maxRetries})`);
            await new Promise(resolve => setTimeout(resolve, delay));
            continue;
          }
          throw err;
        }
      }
    };
  }
  return pbInstance;
}
