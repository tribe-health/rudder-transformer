const {
  networkHandler: BrazeNetworkHandler
} = require("../v0/destinations/braze/util");

const {
  networkHandler: customAudResponseHandler
} = require("../v0/destinations/fb_custom_audience/utils");
const {
  networkHandler: MarketoNetworkHandler
} = require("../v0/destinations/marketo/util");
const {
  networkHandler: GenericNetworkHandler
} = require("./networkhandler/genericNetworkHandler");

const handler = {
  generic: GenericNetworkHandler,
  braze: BrazeNetworkHandler,
  marketo: MarketoNetworkHandler,
  fb_custom_audience: customAudResponseHandler
};

module.exports = {
  getNetworkHandler(type) {
    const NetworkHandler = handler[type] || handler.generic;
    return new NetworkHandler();
  }
};
