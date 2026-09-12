/** The JSON Schema subset supported by desktop operation discovery. */
export interface DesktopInputSchema {
  type?: string;
  properties?: Record<string, DesktopInputSchema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: DesktopInputSchema;
  enum?: unknown[];
  maximum?: number;
  exclusiveMinimum?: number;
}

function validateObject(schema: DesktopInputSchema, value: unknown, path: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${path} must be an object.`);
  const object = value as Record<string, unknown>;
  for (const key of schema.required ?? []) {
    if (!Object.hasOwn(object, key)) throw new Error(`${path}.${key} is required.`);
  }
  validateProperties(schema, object, path);
}

function validateProperties(
  schema: DesktopInputSchema,
  object: Record<string, unknown>,
  path: string,
) {
  const properties = schema.properties ?? {};
  for (const [key, value] of Object.entries(object)) {
    if (Object.hasOwn(properties, key)) validateInput(properties[key], value, `${path}.${key}`);
    else if (schema.additionalProperties === false)
      throw new Error(`${path}.${key} is not supported.`);
  }
}

function validateArray(schema: DesktopInputSchema, value: unknown, path: string) {
  if (!Array.isArray(value) || value.length > 1000)
    throw new Error(`${path} must be an array of at most 1,000 items.`);
  for (const item of value) validateInput(schema.items ?? {}, item, `${path}[]`);
}

function validateNumber(schema: DesktopInputSchema, value: number, path: string) {
  if (!Number.isFinite(value)) throw new Error(`${path} must be a finite number.`);
  if (schema.maximum !== undefined && value > schema.maximum)
    throw new Error(`${path} is outside the supported range.`);
  if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum)
    throw new Error(`${path} is outside the supported range.`);
}

export function validateInput(
  schema: DesktopInputSchema,
  value: unknown,
  path = 'arguments',
): void {
  if (schema.type === 'object') validateObject(schema, value, path);
  else if (schema.type === 'array') validateArray(schema, value, path);
  else if (schema.type && typeof value !== schema.type)
    throw new Error(`${path} must be ${schema.type}.`);
  if (schema.enum && !schema.enum.includes(value))
    throw new Error(`${path} must be one of ${schema.enum.join(', ')}.`);
  if (typeof value === 'number') validateNumber(schema, value, path);
}

export function parseDesktopArguments(serialized: unknown): Record<string, unknown> {
  if (typeof serialized !== 'string' || Buffer.byteLength(serialized, 'utf8') > 100_000)
    throw new Error('Desktop arguments must be a JSON object up to 100 KB.');
  const args: unknown = JSON.parse(serialized);
  if (!args || typeof args !== 'object' || Array.isArray(args))
    throw new Error('Desktop arguments must be a JSON object.');
  // Activity ownership comes from the broker, never model-supplied arguments.
  if ('activityId' in args || 'sourceActivityId' in args)
    throw new Error('The desktop supplies the originating chat automatically.');
  return args as Record<string, unknown>;
}
