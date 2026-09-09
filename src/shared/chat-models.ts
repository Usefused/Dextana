/** Some compatible servers only expose IDs; others report task/output metadata. */
export function isChatModel(model: { id: string; [key: string]: any }): boolean {
  if (/(?:embed|rerank|(?:^|[/_-])(?:bge|e5|gte|all-minilm|all-mpnet|instructor)(?:$|[/_:-]))/i.test(model.id)) return false;
  const task = model.task ?? model.pipeline_tag ?? model.type;
  if (typeof task === 'string' && /embedding|feature-extraction|sentence-similarity|rerank/i.test(task)) return false;
  const outputs = model.architecture?.output_modalities ?? model.output_modalities;
  if (Array.isArray(outputs) && !outputs.includes('text')) return false;
  const capabilities = model.capabilities;
  if (Array.isArray(capabilities) && !capabilities.some(value => ['completion', 'chat', 'text-generation'].includes(value))) return false;
  return true;
}
