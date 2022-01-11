/* eslint-disable no-unused-vars */
const { isHttpStatusSuccess } = require("../../util/index");
const { TRANSFORMER_METRIC } = require("../../util/constant");
const { proxyRequest } = require("../../../adapters/network");
const {
  getDynamicMeta,
  processAxiosResponse
} = require("../../../adapters/utils/networkUtils");
const ErrorBuilder = require("../../util/error");
const { DESTINATION } = require("./config");

// Ref: https://developers.facebook.com/docs/marketing-api/error-reference/
// Normal structure of error messages:
// {
//     "error": {
//         "message": "Error validating access token: Session has expired on Friday, 07-Jan-22 01:00:00 PST. The current time is Monday, 10-Jan-22 23:46:53 PST.",
//         "type": "OAuthException",
//         "code": 190,
//         "error_subcode": 463,
//         "fbtrace_id": "AtLeovrXlvFHHTCefPF0-YV"
//     }
// }

const customAudResponseHandler = (destinationResponse, _dest) => {
  const message = `[Facebook Custom Audience Response Handler] Request for ${DESTINATION} Processed Successfully`;
  const { response, status } = destinationResponse;

  const genErrorMessage = `[Facebook Custom Audience Response Handler] Request failed for ${DESTINATION} with status: ${status}`;
  const versionChangeMessage = `[Facebook Custom Audience Response Handler] Request failed for ${DESTINATION} API version update`;

  // if the response from destination is not a success case build an explicit error
  if (!isHttpStatusSuccess(status)) {
    const finalErrorResponse =
      response.error.code === "2635" ? versionChangeMessage : genErrorMessage;
    throw new ErrorBuilder()
      .setStatus(status)
      .setMessage(genErrorMessage)
      .setDestinationResponse(finalErrorResponse)
      .isTransformResponseFailure(true)
      .setStatTags({
        destination: DESTINATION,
        stage: TRANSFORMER_METRIC.TRANSFORMER_STAGE.RESPONSE_TRANSFORM,
        scope: TRANSFORMER_METRIC.MEASUREMENT_TYPE.API.SCOPE,
        meta: getDynamicMeta(status)
      })
      .build();
  }
  // application level errors
  if (!!response && response.error && response.error.code) {
    throw new ErrorBuilder()
      .setStatus(400)
      .setMessage(
        `[Facebook Custom Audience Response Handler] Request failed for ${DESTINATION} with status: ${status} and subcode ${response.error.code}`
      )
      .setDestinationResponse(destinationResponse)
      .isTransformResponseFailure(true)
      .setStatTags({
        destination: DESTINATION,
        scope: TRANSFORMER_METRIC.MEASUREMENT_TYPE.API.SCOPE,
        stage: TRANSFORMER_METRIC.TRANSFORMER_STAGE.RESPONSE_TRANSFORM,
        meta: getDynamicMeta(status)
      })
      .build();
  }
  return {
    status,
    message,
    destinationResponse
  };
};

const networkHandler = function() {
  this.responseHandler = customAudResponseHandler;
  this.proxy = proxyRequest;
  this.processAxiosResponse = processAxiosResponse;
};

module.exports = {
  networkHandler
};
