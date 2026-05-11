import PocketBase from 'pocketbase';

// We use a singleton instance for the client side.
// On the server side, it should ideally be per-request if using Auth, but for this app
// the PocketBase instance mostly connects to the API using Service/Admin keys or as anon.
let pbInstance: PocketBase | null = null;

export function getPocketBase() {
  if (!pbInstance) {
    const url = process.env.NEXT_PUBLIC_POCKETBASE_URL || 'http://127.0.0.1:8090';
    pbInstance = new PocketBase(url);
    
    // Disable auto cancellation to prevent request cancellation issues in React Strict Mode
    pbInstance.autoCancellation(false);
  }
  return pbInstance;
}
