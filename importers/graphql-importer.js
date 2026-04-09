export function importGraphQL(schemaContent, endpointUrl = 'http://localhost:3000/graphql') {
  let schema;
  try {
    schema = typeof schemaContent === 'string' ? JSON.parse(schemaContent) : schemaContent;
  } catch {
    return importFromSDL(schemaContent, endpointUrl);
  }

  if (schema.data?.__schema) {
    return importFromIntrospection(schema.data.__schema, endpointUrl);
  }
  if (schema.__schema) {
    return importFromIntrospection(schema.__schema, endpointUrl);
  }

  return importFromSDL(schemaContent, endpointUrl);
}

function importFromIntrospection(schema, endpointUrl) {
  const queryType = schema.queryType?.name || 'Query';
  const mutationType = schema.mutationType?.name || 'Mutation';

  const types = (schema.types || []).reduce((acc, t) => {
    acc[t.name] = t;
    return acc;
  }, {});

  const queries = types[queryType]?.fields || [];
  const mutations = types[mutationType]?.fields || [];

  const operations = [
    ...queries.map(f => ({ ...f, operationType: 'query' })),
    ...mutations.map(f => ({ ...f, operationType: 'mutation' })),
  ].filter(op => !op.name.startsWith('__'));

  const script = generateK6Script(operations, types, endpointUrl);
  const config = {
    target_url: endpointUrl,
    protocol: 'graphql',
    endpoints: operations.map(op => ({
      method: 'POST',
      url: endpointUrl,
      name: `${op.operationType}_${op.name}`,
    })),
    vus: 10,
    duration: '60s',
  };

  return {
    script,
    config,
    metadata: {
      endpoint: endpointUrl,
      queries: queries.length,
      mutations: mutations.length,
      types: Object.keys(types).filter(t => !t.startsWith('__')).length,
    },
  };
}

function importFromSDL(sdl, endpointUrl) {
  const queries = [];
  const mutations = [];

  const queryBlock = sdl.match(/type\s+Query\s*\{([^}]+)\}/);
  if (queryBlock) {
    const fields = queryBlock[1].match(/\w+(?:\([^)]*\))?\s*:\s*[^\n]+/g) || [];
    for (const field of fields) {
      const name = field.match(/^(\w+)/)?.[1];
      if (name) queries.push({ name, operationType: 'query', args: extractArgs(field) });
    }
  }

  const mutBlock = sdl.match(/type\s+Mutation\s*\{([^}]+)\}/);
  if (mutBlock) {
    const fields = mutBlock[1].match(/\w+(?:\([^)]*\))?\s*:\s*[^\n]+/g) || [];
    for (const field of fields) {
      const name = field.match(/^(\w+)/)?.[1];
      if (name) mutations.push({ name, operationType: 'mutation', args: extractArgs(field) });
    }
  }

  const operations = [...queries, ...mutations];

  const operationBlocks = operations.map(op => {
    const args = (op.args || []).map(a => `$${a.name}: ${a.type}`).join(', ');
    const fieldArgs = (op.args || []).map(a => `${a.name}: $${a.name}`).join(', ');

    return {
      name: op.name,
      type: op.operationType,
      query: `${op.operationType} ${op.name}${args ? `(${args})` : ''} { ${op.name}${fieldArgs ? `(${fieldArgs})` : ''} { id } }`,
      variables: (op.args || []).reduce((acc, a) => {
        acc[a.name] = sampleValue(a.type);
        return acc;
      }, {}),
    };
  });

  const script = generateSimpleK6Script(operationBlocks, endpointUrl);

  return {
    script,
    config: { target_url: endpointUrl, protocol: 'graphql', vus: 10, duration: '60s' },
    metadata: {
      endpoint: endpointUrl,
      queries: queries.length,
      mutations: mutations.length,
      source: 'sdl',
    },
  };
}

function extractArgs(fieldDef) {
  const argsMatch = fieldDef.match(/\(([^)]+)\)/);
  if (!argsMatch) return [];

  return argsMatch[1].split(',').map(arg => {
    const parts = arg.trim().split(':').map(s => s.trim());
    return { name: parts[0], type: parts[1] || 'String' };
  });
}

function generateK6Script(operations, types, endpointUrl) {
  const operationBlocks = operations.slice(0, 20).map(op => {
    const args = (op.args || []).map(a => `$${a.name}: ${resolveTypeName(a.type)}`).join(', ');
    const fieldArgs = (op.args || []).map(a => `${a.name}: $${a.name}`).join(', ');
    const returnFields = generateReturnFields(op.type, types, 2);

    const variables = (op.args || []).reduce((acc, a) => {
      acc[a.name] = generateArgValue(a.type, types);
      return acc;
    }, {});

    return {
      name: op.name,
      type: op.operationType,
      query: `${op.operationType} ${op.name}${args ? `(${args})` : ''} { ${op.name}${fieldArgs ? `(${fieldArgs})` : ''} ${returnFields} }`,
      variables,
    };
  });

  return generateSimpleK6Script(operationBlocks, endpointUrl);
}

function generateSimpleK6Script(operations, endpointUrl) {
  const requestBlocks = operations.map((op, i) => {
    const payload = {
      query: op.query,
      variables: op.variables || {},
    };

    return `  // ${op.type}: ${op.name}
  {
    const res = http.post('${endpointUrl}', JSON.stringify(${JSON.stringify(payload)}), {
      headers: { 'Content-Type': 'application/json', ...headers },
      tags: { name: '${op.type}_${op.name}' },
    });
    check(res, {
      '${op.name}_status_ok': (r) => r.status === 200,
      '${op.name}_no_errors': (r) => !JSON.parse(r.body).errors,
    });
    sleep(1);
  }`;
  });

  return `import http from 'k6/http';
import { check, sleep, group } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 5 },
    { duration: '2m', target: 10 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],
    http_req_failed: ['rate<0.01'],
  },
};

export default function () {
  const headers = {
    // Authorization: 'Bearer ' + __ENV.AUTH_TOKEN,
  };

  group('GraphQL Load Test', function () {
${requestBlocks.join('\n\n')}
  });
}
`;
}

function resolveTypeName(type) {
  if (!type) return 'String';
  if (typeof type === 'string') return type;
  if (type.kind === 'NON_NULL') return `${resolveTypeName(type.ofType)}!`;
  if (type.kind === 'LIST') return `[${resolveTypeName(type.ofType)}]`;
  return type.name || 'String';
}

function generateReturnFields(type, types, depth) {
  if (depth <= 0) return '';
  const typeName = typeof type === 'string' ? type : type?.name || type?.ofType?.name || type?.ofType?.ofType?.name;
  if (!typeName) return '{ id }';

  const typeDef = types[typeName];
  if (!typeDef?.fields) return '';

  const scalarTypes = new Set(['String', 'Int', 'Float', 'Boolean', 'ID', 'DateTime', 'Date']);
  const fields = typeDef.fields
    .filter(f => !f.name.startsWith('__'))
    .slice(0, 5)
    .map(f => {
      const fieldTypeName = resolveTypeName(f.type);
      const baseType = fieldTypeName.replace(/[!\[\]]/g, '');
      if (scalarTypes.has(baseType)) return f.name;
      if (depth > 1 && types[baseType]?.fields) {
        return `${f.name} { id }`;
      }
      return f.name;
    });

  return fields.length > 0 ? `{ ${fields.join(' ')} }` : '{ id }';
}

function generateArgValue(type, types) {
  const typeName = resolveTypeName(type);
  const base = typeName.replace(/[!\[\]]/g, '');

  const scalarDefaults = {
    String: 'test',
    Int: 1,
    Float: 1.0,
    Boolean: true,
    ID: '1',
  };

  return scalarDefaults[base] || 'test';
}

function sampleValue(type) {
  const base = (type || '').replace(/[!\[\]]/g, '').trim();
  const defaults = { String: 'test', Int: 1, Float: 1.0, Boolean: true, ID: '1' };
  return defaults[base] || 'test';
}
