const get = require("get-value");
const set = require("set-value");
const md5 = require("md5");
const { EventType } = require("../../constants");
let { destinationConfigKeys, endpoints, mapPayload } = require("./config");
let apiKey;
let appId;
let mobileApiKey;
let collectContext;

const { defaultPostRequestConfig, mapConditionalKeys } = require("../util");

function removeNullValues(payload) {
  let newPayload = {};
  var vals = Object.keys(payload);
  for (var i = 0; i < vals.length; i++) {
    let currentVal = vals[i];
    if (payload[currentVal] != (null || undefined)) {
      newPayload[currentVal] = payload[currentVal];
    }
  }
  return newPayload;
}

function responseBuilderSimple(payload, message) {
  let newPayload = removeNullValues(payload);
  let endpoint;
  let requestConfig;

  switch (message.type) {
    case EventType.IDENTIFY:
      requestConfig = defaultPostRequestConfig;
      endpoint = endpoints.userUrl;
      break;
    case EventType.TRACK:
      requestConfig = defaultPostRequestConfig;
      endpoint = endpoints.eventsUrl;
      break;
    case EventType.PAGE:
      break;
    case EventType.GROUP:
      requestConfig = defaultPostRequestConfig;
      endpoint = endpoints.companyUrl;
      break;
    default:
      break;
  }

  const response = {
    endpoint,
    header: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      Accept: "application/json"
    },
    requestConfig,
    userId: message.userId ? message.userId : message.anonymousId,
    payload: newPayload
  };
  return response;
}

function addContext(payload, message) {
  const deviceExists = get(message.context.device);
  const osExists = get(message.context.os);
  const appExists = get(message.context.app);

  const deviceKeys = deviceExists ? Object.keys(deviceExists) : [];
  const osKeys = osExists ? Object.keys(osExists) : [];
  const appKeys = appExists ? Object.keys(appExists) : [];

  let customPayload = {};

  deviceKeys.forEach(key => {
    if (key != "id") {
      let deviceKeysMapping = mapPayload.collectContext.device;
      let value = message.context.device[key];
      mapConditionalKeys(key, deviceKeysMapping, value, customPayload);
    }
  });
  osKeys.forEach(key => {
    let osKeysMapping = mapPayload.collectContext.os;
    let value = message.context.os[key];
    mapConditionalKeys(key, osKeysMapping, value, customPayload);
  });
  appKeys.forEach(key => {
    let appKeysMapping = mapPayload.collectContext.app;
    let value = message.context.app[key];
    mapConditionalKeys(key, appKeysMapping, value, customPayload);
  });
  payload.custom_attributes = customPayload;
  return payload;
}

function getGroupPayload(message) {
  let rawPayload = {};
  let companyId = message.event;
  let companyFields = Object.keys(message.context.traits);
  companyFields.forEach(field => {
    let value = message.context.traits[field];
    mapConditionalKeys(field, mapPayload.group.main, value, rawPayload);
  });
  if (!companyFields.includes("id")) {
    set(rawPayload, company_id, md5(company.name));
  }
  rawPayload[company_id] = companyId;
  return rawPayload;
}

function getPagePayload(message) {}

function getIdentifyPayload(message) {
  let rawPayload = {};
  let traits = Object.keys(message.context.traits);
  // let chatWidget = get(message, "context.traits");
  traits.forEach(field => {
    let value = message.context.traits[field];
    if (field === "company") {
      let companies = [];
      let company = {};
      let companyFields = Object.keys(message.context.traits[field]);
      companyFields.forEach(companyTrait => {
        let value = message.context.traits[field][companyTrait];
        let replaceKeys = mapPayload.identify.sub;
        mapConditionalKeys(companyTrait, replaceKeys, value, company);
        company[companyTrait] = value;
      });
      if (!companyFields.includes("id")) {
        set(company, "company_id", md5(company.name));
      }
      companies.push(company);
      set(rawPayload, "companies", companies);
    } else if (field === "anonymousId") {
      let replaceKeys = mapPayload.identify.main;
      mapConditionalKeys(field, replaceKeys, value, rawPayload);
    } else {
      set(rawPayload, field, message.context.traits[field]);
    }
    collectContext ? addContext(rawPayload) : null;
  });
  return rawPayload;
}

function getTrackPayload(message) {
  let rawPayload = {};
  let price = {};
  let traits = Object.keys(message.context.traits);
  traits.forEach(field => {
    let value = message.context.traits[field];

    if (field === ("price" || "currency")) {
      mapConditionalKeys(field, mapPayload.track.sub, value, price);
      rawPayload.price.amount *= 100;
    } else {
      set(rawPayload, field, message.context.traits[field]);
    }
  });
  rawPayload.price = price;
  rawPayload.event_name = message.event;
  return rawPayload;
}

function getTransformedJSON(message) {
  let rawPayload;
  switch (message.type) {
    case EventType.PAGE:
      // The endpoint for returning all the new messages
      rawPayload = getPagePayload(message);
      break;
    case EventType.TRACK:
      rawPayload = getTrackPayload(message);
      break;
    case EventType.IDENTIFY:
      rawPayload = getIdentifyPayload(message);
      break;
    case EventType.GROUP:
      rawPayload = getGroupPayload(message);
      break;
    default:
      break;
  }
  return { ...rawPayload };
}

function setDestinationKeys(destination) {
  const keys = Object.keys(destination.Config);
  keys.forEach(key => {
    switch (key) {
      case destinationConfigKeys.apiKey:
        apiKey = `${destination.Config[key]}`;
        break;
      case destinationConfigKeys.appId:
        appId = `${destination.Config[key]}`;
        break;
      case destinationConfigKeys.mobileApiKey:
        mobileApiKey = `${destination.Config[key]}`;
        break;
      case destinationConfigKeys.collectContext:
        collectContext = `${destination.Config[key]}`;
        break;
      default:
        break;
    }
  });
}

function processSingleMessage(message, destination) {
  setDestinationKeys(destination);
  const properties = getTransformedJSON(message);
  return responseBuilderSimple(properties, message);
}

function process(events) {
  let respList = [];
  events.forEach(event => {
    try {
      response = processSingleMessage(event.message, event.destination);
      respList.push(response);
    } catch (error) {
      respList.push({ statusCode: 400, error: error.message });
    }
  });
  return respList;
}

exports.process = process;
