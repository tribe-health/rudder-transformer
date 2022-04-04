// ========================================================================
// EXPORTS
// ========================================================================
// keep it sorted to find easily

const getMetadata = metadata => {
  return {
    sourceType: metadata.sourceType,
    destinationType: metadata.destinationType,
    k8_namespace: metadata.namespace
  };
};

const isObject = value => {
  const type = typeof value;
  return (
    value != null &&
    (type === "object" || type === "function") &&
    !Array.isArray(value)
  );
};

const isNonFuncObject = value => {
  const type = typeof value;
  return value != null && type === "object" && !Array.isArray(value);
};

const ErrorMessage = {
  TypeNotFound: "Invalid payload. Property Type is not present",
  TypeNotSupported: "Message type not supported",
  FailedToConstructPayload: "Payload could not be constructed"
};

class CustomError extends Error {
  constructor(message, statusCode, metadata) {
    super(message);
    this.response = { status: statusCode, metadata };
  }
}

module.exports = {
  CustomError,
  ErrorMessage,
  isNonFuncObject,
  isObject,
  getMetadata
};
