// Shopify-style hosted checkout: the cart's checkoutUrl points at
// Shopify's own PCI-compliant hosted checkout page — this app never
// renders a card field of any kind, so it needs no payment SDK
// dependency at all (real vercel/commerce has none declared). This file
// proves the rule doesn't fire just because no payment SDK is present —
// it only fires when a raw card-shaped field is ALSO present, which this
// pattern never has.
interface ShopifyCheckoutButtonProps {
  checkoutUrl: string;
}

export function ShopifyCheckoutButton({ checkoutUrl }: ShopifyCheckoutButtonProps) {
  return (
    <a href={checkoutUrl} className="checkout-button">
      Checkout
    </a>
  );
}
