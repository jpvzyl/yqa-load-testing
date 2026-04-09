// E-Commerce User Journey — multi-step flow simulating a real shopper.
// browse → search → view product → add to cart → checkout
// Each step is a group for per-step metrics. Uses data correlation
// (product IDs, cart tokens) to chain requests realistically.
//
// Usage: k6 run ecommerce-flow.js
//        k6 run -e BASE_URL=https://shop.example.com -e API_TOKEN=xxx ecommerce-flow.js

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const API_TOKEN = __ENV.API_TOKEN || '';

const errorRate = new Rate('custom_errors');
const browseDuration = new Trend('step_browse_duration', true);
const searchDuration = new Trend('step_search_duration', true);
const viewProductDuration = new Trend('step_view_product_duration', true);
const addToCartDuration = new Trend('step_add_to_cart_duration', true);
const checkoutDuration = new Trend('step_checkout_duration', true);

const SEARCH_TERMS = ['shoes', 'laptop', 'headphones', 'jacket', 'watch', 'camera', 'backpack'];

export const options = {
  stages: [
    { duration: '30s', target: 20 },
    { duration: '3m', target: 20 },
    { duration: '15s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<1000'],
    http_req_failed: ['rate<0.03'],
    custom_errors: ['rate<0.03'],
    step_browse_duration: ['p(95)<800'],
    step_search_duration: ['p(95)<600'],
    step_view_product_duration: ['p(95)<500'],
    step_add_to_cart_duration: ['p(95)<700'],
    step_checkout_duration: ['p(95)<1500'],
  },
};

function headers() {
  const h = { 'Content-Type': 'application/json' };
  if (API_TOKEN) h['Authorization'] = `Bearer ${API_TOKEN}`;
  return h;
}

function extractJson(res) {
  try { return JSON.parse(res.body); } catch (_) { return null; }
}

export default function () {
  let productId;
  let cartId;

  // --- STEP 1: Browse products ---
  group('Browse products', () => {
    const res = http.get(`${BASE_URL}/api/products?page=1&limit=12`, { headers: headers() });

    const passed = check(res, {
      'browse: status 200': (r) => r.status === 200,
      'browse: has products': (r) => {
        const data = extractJson(r);
        return data && (Array.isArray(data.products || data.items || data) && (data.products || data.items || data).length > 0);
      },
    });

    errorRate.add(!passed);
    browseDuration.add(res.timings.duration);

    const data = extractJson(res);
    if (data) {
      const items = data.products || data.items || data;
      if (Array.isArray(items) && items.length > 0) {
        productId = items[Math.floor(Math.random() * items.length)].id;
      }
    }
  });

  sleep(Math.random() * 3 + 1); // browsing think time

  // --- STEP 2: Search ---
  group('Search products', () => {
    const term = SEARCH_TERMS[Math.floor(Math.random() * SEARCH_TERMS.length)];
    const res = http.get(`${BASE_URL}/api/products/search?q=${encodeURIComponent(term)}`, { headers: headers() });

    const passed = check(res, {
      'search: status 200': (r) => r.status === 200,
      'search: has results': (r) => {
        const data = extractJson(r);
        return data !== null;
      },
    });

    errorRate.add(!passed);
    searchDuration.add(res.timings.duration);

    if (!productId) {
      const data = extractJson(res);
      if (data) {
        const items = data.products || data.items || data.results || data;
        if (Array.isArray(items) && items.length > 0) {
          productId = items[0].id;
        }
      }
    }
  });

  sleep(Math.random() * 2 + 1);

  if (!productId) return;

  // --- STEP 3: View product detail ---
  group('View product', () => {
    const res = http.get(`${BASE_URL}/api/products/${productId}`, { headers: headers() });

    const passed = check(res, {
      'view: status 200': (r) => r.status === 200,
      'view: has product data': (r) => {
        const data = extractJson(r);
        return data && data.id;
      },
    });

    errorRate.add(!passed);
    viewProductDuration.add(res.timings.duration);
  });

  sleep(Math.random() * 2 + 1);

  // --- STEP 4: Add to cart ---
  group('Add to cart', () => {
    const payload = JSON.stringify({
      product_id: productId,
      quantity: Math.floor(Math.random() * 3) + 1,
    });

    const res = http.post(`${BASE_URL}/api/cart/items`, payload, { headers: headers() });

    const passed = check(res, {
      'cart: status 200 or 201': (r) => r.status === 200 || r.status === 201,
      'cart: has cart data': (r) => {
        const data = extractJson(r);
        return data && (data.cart_id || data.id || data.items);
      },
    });

    errorRate.add(!passed);
    addToCartDuration.add(res.timings.duration);

    const data = extractJson(res);
    if (data) {
      cartId = data.cart_id || data.id;
    }
  });

  sleep(Math.random() * 2 + 1);

  // --- STEP 5: Checkout ---
  group('Checkout', () => {
    const payload = JSON.stringify({
      cart_id: cartId,
      shipping: {
        address: '123 Load Test St',
        city: 'Testville',
        zip: '12345',
        country: 'US',
      },
      payment: {
        method: 'test_card',
        token: 'tok_test_' + __VU,
      },
    });

    const res = http.post(`${BASE_URL}/api/checkout`, payload, { headers: headers() });

    const passed = check(res, {
      'checkout: status 200 or 201': (r) => r.status === 200 || r.status === 201,
      'checkout: has order id': (r) => {
        const data = extractJson(r);
        return data && (data.order_id || data.id);
      },
    });

    errorRate.add(!passed);
    checkoutDuration.add(res.timings.duration);
  });

  sleep(Math.random() * 2 + 1);
}
