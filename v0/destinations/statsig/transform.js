// adding useless items on top of Statsig
const fs = require("fs");
const path = require("path");
const { EventType } = require("../../../constants");
const {
  defaultPostRequestConfig,
  defaultRequestConfig,
  CustomError,
  constructPayload
} = require("../../util");

function process(event) {
  const { message, destination } = event;

  if (!message.type) {
    throw new CustomError(
      "Message Type is not present. Aborting message.",
      400
    );
  }
  const messageType = message.type.toLowerCase();

  switch (messageType) {
    case EventType.IDENTIFY:
    case EventType.PAGE:
    case EventType.SCREEN:
    case EventType.TRACK:
    case EventType.ALIAS:
    case EventType.GROUP:
      break;
    default:
      throw new CustomError("Message type not supported", 400);
  }
  const mappingJson = JSON.parse(
    fs.readFileSync(path.resolve(__dirname, "./mapping.json"))
  );
  const mappedPayload = constructPayload(message, mappingJson);
  const spreadedMessage = { ...message, ...mappedPayload };

  const keys = ["delKey1", "delKey2"];
  keys.forEach(k => {
    delete spreadedMessage[k];
  });

  const response = defaultRequestConfig();
  const { secretKey } = destination.Config;

  response.method = defaultPostRequestConfig.requestMethod;
  response.body.JSON = spreadedMessage;
  response.headers = {
    "content-type": "application/json",
    "STATSIG-API-KEY": secretKey
  };

  response.endpoint = "https://api.statsig.com/v1/webhooks/rudderstack";
  response.rudderContextUsage = "someVal";

  return response;
}

exports.process = process;
