const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

class Schema {
  optional() {
    return new DerivedSchema((input) => (input === undefined ? undefined : this.parse(input)));
  }

  nullable() {
    return new DerivedSchema((input) => (input === null ? null : this.parse(input)));
  }

  pipe(nextSchema) {
    return new DerivedSchema((input) => nextSchema.parse(this.parse(input)));
  }

  transform(transformer) {
    return new DerivedSchema((input) => transformer(this.parse(input)));
  }
}

class DerivedSchema extends Schema {
  constructor(parser) {
    super();
    this.parser = parser;
  }

  parse(input) {
    return this.parser(input);
  }
}

class StringSchema extends Schema {
  constructor(options = {}) {
    super();
    this.options = {
      maxLength: options.maxLength ?? null,
      minLength: options.minLength ?? null,
      shouldTrim: options.shouldTrim ?? false,
      shouldValidateUuid: options.shouldValidateUuid ?? false,
    };
  }

  max(length) {
    return new StringSchema({
      ...this.options,
      maxLength: length,
    });
  }

  min(length) {
    return new StringSchema({
      ...this.options,
      minLength: length,
    });
  }

  parse(input) {
    if (typeof input !== 'string') {
      throw new Error('Expected string');
    }

    const value = this.options.shouldTrim ? input.trim() : input;

    if (this.options.minLength !== null && value.length < this.options.minLength) {
      throw new Error(`Expected string with at least ${this.options.minLength} characters`);
    }

    if (this.options.maxLength !== null && value.length > this.options.maxLength) {
      throw new Error(`Expected string with at most ${this.options.maxLength} characters`);
    }

    if (this.options.shouldValidateUuid && !UUID_PATTERN.test(value)) {
      throw new Error('Expected UUID');
    }

    return value;
  }

  trim() {
    return new StringSchema({
      ...this.options,
      shouldTrim: true,
    });
  }

  uuid() {
    return new StringSchema({
      ...this.options,
      shouldValidateUuid: true,
    });
  }
}

class EnumSchema extends Schema {
  constructor(values) {
    super();
    this.values = new Set(values);
  }

  parse(input) {
    if (!this.values.has(input)) {
      throw new Error(`Expected one of: ${[...this.values].join(', ')}`);
    }

    return input;
  }
}

class LiteralSchema extends Schema {
  constructor(value) {
    super();
    this.value = value;
  }

  parse(input) {
    if (input !== this.value) {
      throw new Error(`Expected literal ${String(this.value)}`);
    }

    return input;
  }
}

class ObjectSchema extends Schema {
  constructor(shape) {
    super();
    this.shape = shape;
  }

  parse(input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new Error('Expected object');
    }

    const result = {};

    for (const [key, schema] of Object.entries(this.shape)) {
      result[key] = schema.parse(input[key]);
    }

    return result;
  }

  pick(selection) {
    const nextShape = {};

    for (const key of Object.keys(selection)) {
      nextShape[key] = this.shape[key];
    }

    return new ObjectSchema(nextShape);
  }
}

export const z = {
  enum(values) {
    return new EnumSchema(values);
  },
  literal(value) {
    return new LiteralSchema(value);
  },
  object(shape) {
    return new ObjectSchema(shape);
  },
  string() {
    return new StringSchema();
  },
};
