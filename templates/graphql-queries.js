// GraphQL Query & Mutation Test — sends operations over HTTP POST.
// Tests both read (query) and write (mutation) paths and checks for GraphQL-level errors.
//
// Usage: k6 run graphql-queries.js
//        k6 run -e BASE_URL=https://api.example.com -e API_TOKEN=xxx graphql-queries.js

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const GRAPHQL_PATH = __ENV.GRAPHQL_PATH || '/graphql';
const API_TOKEN = __ENV.API_TOKEN || '';

const errorRate = new Rate('custom_errors');
const queryDuration = new Trend('graphql_query_duration', true);
const mutationDuration = new Trend('graphql_mutation_duration', true);

export const options = {
  stages: [
    { duration: '15s', target: 10 },
    { duration: '2m', target: 10 },
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<600'],
    http_req_failed: ['rate<0.02'],
    custom_errors: ['rate<0.02'],
    graphql_query_duration: ['p(95)<500'],
    graphql_mutation_duration: ['p(95)<800'],
  },
};

function gqlHeaders() {
  const h = { 'Content-Type': 'application/json' };
  if (API_TOKEN) h['Authorization'] = `Bearer ${API_TOKEN}`;
  return h;
}

function gqlRequest(query, variables = {}) {
  return JSON.stringify({ query, variables });
}

function hasNoErrors(res) {
  try {
    const body = JSON.parse(res.body);
    return !body.errors || body.errors.length === 0;
  } catch (_) {
    return false;
  }
}

export default function () {
  const url = `${BASE_URL}${GRAPHQL_PATH}`;

  // --- QUERY: list items ---
  group('GraphQL query — list', () => {
    const payload = gqlRequest(`
      query ListItems($limit: Int) {
        items(limit: $limit) {
          id
          name
          createdAt
        }
      }
    `, { limit: 10 });

    const res = http.post(url, payload, { headers: gqlHeaders() });

    const passed = check(res, {
      'query list: status 200': (r) => r.status === 200,
      'query list: no GraphQL errors': (r) => hasNoErrors(r),
      'query list: has data': (r) => {
        try { return !!JSON.parse(r.body).data; } catch (_) { return false; }
      },
    });

    errorRate.add(!passed);
    queryDuration.add(res.timings.duration);
  });

  sleep(Math.random() * 1 + 0.5);

  // --- QUERY: single item ---
  group('GraphQL query — single', () => {
    const payload = gqlRequest(`
      query GetItem($id: ID!) {
        item(id: $id) {
          id
          name
          description
          value
        }
      }
    `, { id: '1' });

    const res = http.post(url, payload, { headers: gqlHeaders() });

    const passed = check(res, {
      'query single: status 200': (r) => r.status === 200,
      'query single: no GraphQL errors': (r) => hasNoErrors(r),
    });

    errorRate.add(!passed);
    queryDuration.add(res.timings.duration);
  });

  sleep(Math.random() * 0.5 + 0.3);

  // --- MUTATION: create item ---
  group('GraphQL mutation — create', () => {
    const payload = gqlRequest(`
      mutation CreateItem($input: CreateItemInput!) {
        createItem(input: $input) {
          id
          name
          value
        }
      }
    `, {
      input: {
        name: `gql-item-${Date.now()}-${__VU}`,
        description: 'Created by k6 load test',
        value: Math.floor(Math.random() * 1000),
      },
    });

    const res = http.post(url, payload, { headers: gqlHeaders() });

    const passed = check(res, {
      'mutation create: status 200': (r) => r.status === 200,
      'mutation create: no GraphQL errors': (r) => hasNoErrors(r),
      'mutation create: returns id': (r) => {
        try { return !!JSON.parse(r.body).data.createItem.id; } catch (_) { return false; }
      },
    });

    errorRate.add(!passed);
    mutationDuration.add(res.timings.duration);
  });

  sleep(Math.random() * 0.5 + 0.3);

  // --- MUTATION: update item ---
  group('GraphQL mutation — update', () => {
    const payload = gqlRequest(`
      mutation UpdateItem($id: ID!, $input: UpdateItemInput!) {
        updateItem(id: $id, input: $input) {
          id
          name
          value
        }
      }
    `, {
      id: '1',
      input: {
        name: `updated-${Date.now()}`,
        value: Math.floor(Math.random() * 9999),
      },
    });

    const res = http.post(url, payload, { headers: gqlHeaders() });

    const passed = check(res, {
      'mutation update: status 200': (r) => r.status === 200,
      'mutation update: no GraphQL errors': (r) => hasNoErrors(r),
    });

    errorRate.add(!passed);
    mutationDuration.add(res.timings.duration);
  });

  sleep(Math.random() * 1 + 0.5);
}
