type Model = { id: string; [key: string]: any };

export function isVisionModel(model: Model): boolean {
  if (isEmbeddingModel(model)) return false;
  const inputs = model.architecture?.input_modalities ?? model.input_modalities;
  return (Array.isArray(inputs) && inputs.includes('image')) ||
    (Array.isArray(model.capabilities) && model.capabilities.includes('vision'));
}

/** Some compatible servers only expose IDs; others report task/output metadata. */
export function isEmbeddingModel(model: Model): boolean {
  const task = model.task ?? model.pipeline_tag ?? model.type;
  if (/rerank/i.test(model.id) || (typeof task === 'string' && /rerank/i.test(task))) return false;
  if (typeof task === 'string' && /embedding|feature-extraction|sentence-similarity/i.test(task)) return true;
  const outputs = model.architecture?.output_modalities ?? model.output_modalities;
  if (Array.isArray(outputs) && outputs.some(value => ['embedding', 'embeddings'].includes(value))) return true;
  if (Array.isArray(model.capabilities) && model.capabilities.some((value: string) => ['embedding', 'embeddings'].includes(value))) return true;
  return /(?:embed|(?:^|[/_-])(?:bge|e5|gte|all-minilm|all-mpnet|instructor)(?:$|[/_:-]))/i.test(model.id);
}

export function isChatModel(model: Model): boolean {
  if (isEmbeddingModel(model) || /rerank/i.test(model.id)) return false;
  const task = model.task ?? model.pipeline_tag ?? model.type;
  if (typeof task === 'string' && /embedding|feature-extraction|sentence-similarity|rerank/i.test(task)) return false;
  const outputs = model.architecture?.output_modalities ?? model.output_modalities;
  if (Array.isArray(outputs) && !outputs.includes('text')) return false;
  const capabilities = model.capabilities;
  if (Array.isArray(capabilities) && !capabilities.some(value => ['completion', 'chat', 'text-generation'].includes(value))) return false;
  return true;
}
