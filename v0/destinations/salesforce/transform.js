const get = require("get-value");
const { EventType, MappedToDestinationKey } = require("../../../constants");
const {
  SF_API_VERSION,
  SF_TOKEN_REQUEST_URL,
  SF_TOKEN_REQUEST_URL_SANDBOX,
  identifyLeadMappingJson,
  identifyContactMappingJson,
  ignoredLeadTraits,
  ignoredContactTraits
} = require("./config");
const {
  removeUndefinedValues,
  defaultRequestConfig,
  defaultPostRequestConfig,
  getFieldValueFromMessage,
  constructPayload,
  getFirstAndLastName,
  getSuccessRespEvents,
  getErrorRespEvents,
  CustomError,
  addExternalIdToTraits,
  checkInvalidRtTfEvents,
  handleRtTfSingleEventError
} = require("../../util");
const { httpGET, httpPOST } = require("../../../adapters/network");
const {
  processAxiosResponse
} = require("../../../adapters/utils/networkUtils");
const { TRANSFORMER_METRIC } = require("../../util/constant");

// Utility method to construct the header to be used for SFDC API calls
// The "Authorization: Bearer <token>" header element needs to be passed for
// authentication for all SFDC REST API calls
async function getSFDCHeader(destination) {
  let SF_TOKEN_URL;
  if (destination.Config.sandbox) {
    SF_TOKEN_URL = SF_TOKEN_REQUEST_URL_SANDBOX;
  } else {
    SF_TOKEN_URL = SF_TOKEN_REQUEST_URL;
  }
  const authUrl = `${SF_TOKEN_URL}?username=${
    destination.Config.userName
  }&password=${encodeURIComponent(
    destination.Config.password
  )}${encodeURIComponent(destination.Config.initialAccessToken)}&client_id=${
    destination.Config.consumerKey
  }&client_secret=${destination.Config.consumerSecret}&grant_type=password`;
  const sfAuthResponse = await httpPOST(authUrl, {});
  const processedsfAuthResponse = processAxiosResponse(sfAuthResponse);
  if (processedsfAuthResponse.status !== 200) {
    throw new CustomError(
      `SALESFORCE AUTH FAILED: ${JSON.stringify(
        processedsfAuthResponse.response
      )}`,
      processedsfAuthResponse.status
    );
  }

  return {
    token: `Bearer ${processedsfAuthResponse.response.access_token}`,
    instanceUrl: processedsfAuthResponse.response.instance_url
  };
}

// Basic response builder
// We pass the parameterMap with any processing-specific key-value prepopulated
// We also pass the incoming payload, the hit type to be generated and
// the field mapping and credentials JSONs
function responseBuilderSimple(
  traits,
  salesforceMap,
  authorizationData,
  mapProperty,
  mappedToDestination
) {
  const { salesforceType, salesforceId } = salesforceMap;

  // if id is valid, do update else create the object
  // POST for create, PATCH for update
  let targetEndpoint = `${authorizationData.instanceUrl}/services/data/v${SF_API_VERSION}/sobjects/${salesforceType}`;
  if (salesforceId) {
    targetEndpoint += `/${salesforceId}?_HttpMethod=PATCH`;
  }

  // First name and last name need to be extracted from the name field
  // get traits from the message
  let rawPayload = traits;
  // map using the config only if the type is Lead
  // If message is already mapped to destination, Do not map it using config and send traits as-is
  if (salesforceType === "Lead" && mapProperty && !mappedToDestination) {
    // adjust the payload only for new Leads. For update do incremental update
    // adjust for firstName and lastName
    // construct the payload using the mappingJson and add extra params
    rawPayload = constructPayload(
      { ...traits, ...getFirstAndLastName(traits, "n/a") },
      identifyLeadMappingJson
    );
    Object.keys(traits).forEach(key => {
      if (ignoredLeadTraits.indexOf(key) === -1 && traits[key]) {
        rawPayload[`${key}__c`] = traits[key];
      }
    });
  } else if (
    salesforceType === "Contact" &&
    mapProperty &&
    !mappedToDestination
  ) {
    rawPayload = constructPayload(
      { ...traits, ...getFirstAndLastName(traits, "n/a") },
      identifyContactMappingJson
    );
    Object.keys(traits).forEach(key => {
      if (ignoredContactTraits.indexOf(key) === -1 && traits[key]) {
        rawPayload[`${key}__c`] = traits[key];
      }
    });
  }

  const response = defaultRequestConfig();
  const header = {
    "Content-Type": "application/json",
    Authorization: authorizationData.token
  };
  response.method = defaultPostRequestConfig.requestMethod;
  response.headers = header;
  response.body.JSON = removeUndefinedValues(rawPayload);
  response.endpoint = targetEndpoint;

  return response;
}

// Look up to salesforce using details passed as external id through payload
async function getSaleforceIdForRecord(
  authorizationData,
  objectType,
  identifierType,
  identifierValue
) {
  const objSearchUrl = `${authorizationData.instanceUrl}/services/data/v${SF_API_VERSION}/parameterizedSearch/?q=${identifierValue}&sobject=${objectType}&in=${identifierType}&${objectType}.fields=id`;
  const sfSearchResponse = await httpGET(objSearchUrl, {
    headers: { Authorization: authorizationData.token }
  });
  const processedsfSearchResponse = processAxiosResponse(sfSearchResponse);
  if (processedsfSearchResponse.status !== 200) {
    throw new CustomError(
      `SALESFORCE SEARCH BY ID: ${JSON.stringify(
        processedsfSearchResponse.response
      )}`,
      processedsfSearchResponse.status
    );
  }
  return get(processedsfSearchResponse.response, "searchRecords.0.Id");
}

// Check for externalId field under context and look for probable Salesforce objects
// We'll make separate requests for every Salesforce Object types present under externalIds
//
// Expected externalId map for Contact object:
//
// ------------------------
// {
//   "type": "Salesforce-Library",
//   "id": "test@gmail.com"

// }
// ------------------------
//
// We'll use the Salesforce Object names by removing "Salesforce-" string from the type field
//
// Default Object type will be "Lead" for backward compatibility
async function getSalesforceIdFromPayload(
  message,
  authorizationData,
  destination
) {
  // define default map
  const salesforceMaps = [];

  // get externalId
  const externalIds = get(message, "context.externalId");
  const mappedToDestination = get(message, MappedToDestinationKey);

  // if externalIds are present look for type `Salesforce-`
  if (externalIds && Array.isArray(externalIds) && !mappedToDestination) {
    externalIds.forEach(extIdMap => {
      const { type, id } = extIdMap;
      if (type.includes("Salesforce")) {
        salesforceMaps.push({
          salesforceType: type.replace("Salesforce-", ""),
          salesforceId: id
        });
      }
    });
  }

  // Support All salesforce objects, do not fallback to lead in case event is mapped to destination
  if (mappedToDestination) {
    const { id, type, identifierType } = get(message, "context.externalId.0");

    if (
      !id ||
      !type ||
      !identifierType ||
      !type.toLowerCase().includes("salesforce")
    ) {
      throw new CustomError(
        "Invalid externalId. id, type, identifierType must be provided",
        400
      );
    }

    const objectType = type.toLowerCase().replace("salesforce-", "");
    let salesforceId = id;

    // Fetch the salesforce Id if the identifierType is not ID
    if (identifierType.toUpperCase() !== "ID") {
      salesforceId = await getSaleforceIdForRecord(
        authorizationData,
        objectType,
        identifierType,
        id
      );
    }

    salesforceMaps.push({
      salesforceType: objectType,
      salesforceId
    });
  }

  // if nothing is present consider it as a Lead Object
  // BACKWORD COMPATIBILITY
  if (salesforceMaps.length === 0 && !mappedToDestination) {
    // its a lead object. try to get lead object id using search query
    // check if the lead exists
    // need to perform a parameterized search for this using email
    const email = getFieldValueFromMessage(message, "email");

    if (!email) {
      throw new CustomError("Invalid Email address for Lead Objet", 400);
    }

    const leadQueryUrl = `${authorizationData.instanceUrl}/services/data/v${SF_API_VERSION}/parameterizedSearch/?q=${email}&sobject=Lead&Lead.fields=id,IsConverted,ConvertedContactId,IsDeleted`;

    // request configuration will be conditional
    const leadQueryResponse = await httpGET(leadQueryUrl, {
      headers: { Authorization: authorizationData.token }
    });
    const processedLeadQueryResponse = processAxiosResponse(leadQueryResponse);

    if (processedLeadQueryResponse.status !== 200) {
      throw new CustomError(
        `During Lead Query: ${JSON.stringify(
          processedLeadQueryResponse.response
        )}`,
        processedLeadQueryResponse.status
      );
    }

    if (processedLeadQueryResponse.response.searchRecords.length > 0) {
      // if count is greater than zero, it means that lead exists, then only update it
      // else the original endpoint, which is the one for creation - can be used
      const record = processedLeadQueryResponse.response.searchRecords[0];
      if (record.IsDeleted === true) {
        if (record.IsConverted) {
          throw new CustomError("The contact has been deleted.", 400);
        } else {
          throw new CustomError("The lead has been deleted.", 400);
        }
      }
      if (record.IsConverted && destination.Config.useContactId) {
        salesforceMaps.push({
          salesforceType: "Contact",
          salesforceId: record.ConvertedContactId
        });
      } else {
        salesforceMaps.push({
          salesforceType: "Lead",
          salesforceId: record.Id
        });
      }
    } else {
      salesforceMaps.push({
        salesforceType: "Lead",
        salesforceId: undefined
      });
    }
  }
  return salesforceMaps;
}

// Function for handling identify events
async function processIdentify(message, authorizationData, destination) {
  const mapProperty =
    destination.Config.mapProperty === undefined
      ? true
      : destination.Config.mapProperty;
  // check the traits before hand
  const traits = getFieldValueFromMessage(message, "traits");
  if (!traits) {
    throw new CustomError(
      "PROCESS IDENTIFY: Invalid traits for Salesforce request",
      400
    );
  }

  // Append external ID to traits if event is mapped to destination and only if identifier type is not id
  // If identifier type is id, then it should not be added to traits, else saleforce will throw an error
  const mappedToDestination = get(message, MappedToDestinationKey);
  const identifierType = get(message, "context.externalId.0.type");
  if (
    mappedToDestination &&
    identifierType &&
    identifierType.toLowerCase !== "id"
  ) {
    addExternalIdToTraits(message);
  }

  // if traits is correct, start processing
  const responseData = [];

  // get salesforce object map
  const salesforceMaps = await getSalesforceIdFromPayload(
    message,
    authorizationData,
    destination
  );

  // iterate over the object types found
  salesforceMaps.forEach(salesforceMap => {
    // finally build the response and push to the list
    responseData.push(
      responseBuilderSimple(
        traits,
        salesforceMap,
        authorizationData,
        mapProperty,
        mappedToDestination
      )
    );
  });

  return responseData;
}

// Generic process function which invokes specific handler functions depending on message type
// and event type where applicable
async function processSingleMessage(message, authorizationData, destination) {
  let response;
  if (message.type === EventType.IDENTIFY) {
    response = await processIdentify(message, authorizationData, destination);
  } else {
    throw new CustomError(`message type ${message.type} is not supported`, 400);
  }
  return response;
}

async function process(event) {
  // Get the authorization header if not available
  const authorizationData = await getSFDCHeader(event.destination);
  const response = await processSingleMessage(
    event.message,
    authorizationData,
    event.destination
  );
  return response;
}

const processRouterDest = async inputs => {
  const errorRespEvents = checkInvalidRtTfEvents(inputs, "SALESFORCE");
  if (errorRespEvents.length > 0) {
    return errorRespEvents;
  }

  let authorizationData;
  try {
    authorizationData = await getSFDCHeader(inputs[0].destination);
  } catch (error) {
    const respEvents = getErrorRespEvents(
      inputs.map(input => input.metadata),
      400,
      `Authorisation failed: ${error.message}`,
      {
        destType: "SALESFORCE",
        stage: TRANSFORMER_METRIC.TRANSFORMER_STAGE.TRANSFORM,
        scope: TRANSFORMER_METRIC.MEASUREMENT_TYPE.AUTHENTICATION.SCOPE
      }
    );
    return [respEvents];
  }

  const respList = await Promise.all(
    inputs.map(async input => {
      try {
        if (input.message.statusCode) {
          // already transformed event
          return getSuccessRespEvents(
            input.message,
            [input.metadata],
            input.destination
          );
        }

        // unprocessed payload
        return getSuccessRespEvents(
          await processSingleMessage(
            input.message,
            authorizationData,
            input.destination
          ),
          [input.metadata],
          input.destination
        );
      } catch (error) {
        return handleRtTfSingleEventError(input, error, "SALESFORCE");
      }
    })
  );
  return respList;
};

module.exports = { process, processRouterDest };
