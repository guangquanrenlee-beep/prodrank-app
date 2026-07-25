export {};
declare global {
  interface Window {
    Paddle?: {
      Checkout: {
        open: (options: { items: { priceId: string; quantity: number }[] }) => void;
      };
    };
  }
}
