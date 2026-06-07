function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function cleanString(value) {
  if (value == null) return '';
  return String(value);
}

function firstString(...values) {
  for (let value of values) {
    if (typeof value === 'string') return value;
  }
  return '';
}

function firstOptionalString(...values) {
  for (let value of values) {
    if (typeof value === 'string') return value;
  }
  return undefined;
}

function normalizeDiagnostics(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((diagnostic) => {
      let data = asObject(diagnostic);
      let message = cleanString(data.message || data.text || data.ruleId);
      if (!message) return null;
      return {
        ...data,
        message,
        severity: cleanString(data.severity || data.level || 'info'),
      };
    })
    .filter(Boolean);
}

export function normalizeSourceDocument(rawDocument = {}) {
  let data = asObject(rawDocument);
  let path = cleanString(data.path || data.id || data.uri).trim();
  if (!path) throw new Error('source document path is required');

  let content = firstString(data.content, data.code, data.text, data.raw, data.rawContent);
  let raw = firstString(data.raw, data.rawContent, content);
  let language = cleanString(data.language || data.lang || 'text').trim() || 'text';
  let document = {
    path,
    language,
    content,
    raw,
    readOnly: Boolean(data.readOnly ?? data.readonly),
    dirty: Boolean(data.dirty),
    diagnostics: normalizeDiagnostics(data.diagnostics),
  };

  if (data.readable !== undefined || data.isReadable !== undefined) {
    document.readable = Boolean(data.readable ?? data.isReadable);
  }
  if (data.expanded !== undefined) document.expanded = Boolean(data.expanded);
  if (data.statsText != null) document.statsText = cleanString(data.statsText);
  if (data.title != null) document.title = cleanString(data.title);
  if (data.description != null) document.description = cleanString(data.description);

  let metadata = asObject(data.metadata);
  if (Object.keys(metadata).length > 0) document.metadata = metadata;
  return document;
}

export function createSourceDocument(rawPayload = {}, options = {}) {
  let payload = asObject(rawPayload);
  let document = {
    ...payload,
    ...options,
    path: options.path ?? payload.path,
    language: options.language ?? options.lang ?? payload.language ?? payload.lang,
    content: firstString(options.content, payload.content, payload.code, payload.text, payload.compressed),
  };
  let raw = firstOptionalString(options.raw, options.rawContent, payload.raw, payload.rawContent);
  if (raw !== undefined) document.raw = raw;
  return normalizeSourceDocument(document);
}
