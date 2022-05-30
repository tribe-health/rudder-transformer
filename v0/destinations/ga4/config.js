const { getMappingConfig } = require("../../util");

const ENDPOINT = "https://www.google-analytics.com/mp/collect";

const ConfigCategory = {
  COMMON: { name: "GA4CommonConfig" },
  ITEMS: { name: "GA4ItemsConfig" },

  /* E-Commerce Events */
  // Ref - https://www.rudderstack.com/docs/rudderstack-api/api-specification/rudderstack-ecommerce-events-specification/
  /* Browsing Section */
  PRODUCTS_SEARCHED: { name: "GA4ProductsSearchedConfig" },
  PRODUCT_LIST_VIEWED: { name: "GA4ProductListViewedConfig" },

  /* Promotions Section */
  PROMOTION_VIEWED: { name: "GA4PromotionViewedConfig" },
  PROMOTION_CLICKED: { name: "GA4PromotionClickedConfig" },

  /* Ordering Section */
  PRODUCT_CLICKED: { name: "GA4ProductClickedConfig" },
  PRODUCT_VIEWED: { name: "GA4ProductViewedConfig" },
  PRODUCT_ADDED: { name: "GA4ProductAddedConfig" },
  PRODUCT_REMOVED: { name: "GA4ProductRemovedConfig" },
  CART_VIEWED: { name: "GA4CartViewedConfig" },
  CHECKOUT_STARTED: { name: "GA4CheckoutStartedConfig" },
  PAYMENT_INFO_ENTERED: { name: "GA4PaymentInfoEnteredConfig" },
  ORDER_COMPLETED: { name: "GA4OrderCompletedConfig" },
  ORDER_REFUNDED: { name: "GA4OrderRefundedConfig" },

  /* Wishlist Section */
  PRODUCT_ADDED_TO_WISHLIST: { name: "GA4ProductAddedToWishlistConfig" },

  /* Sharing Section */
  PRODUCT_SHARED: { name: "GA4ProductSharedConfig" },
  CART_SHARED: { name: "GA4CartSharedConfig" },

  /* Group */
  GROUP: { name: "GA4GroupConfig" },

  /* GA4 Events */
  GENERATE_LEAD: { name: "GA4GenerateLeadConfig" },
  LOGIN: { name: "GA4LoginConfig" },
  SIGN_UP: { name: "GA4SignUpConfig" }
};

/**
 * GA4 Events (29)
 * Ref - https://developers.google.com/analytics/devguides/collection/protocol/ga4/reference/events
 */
const eventNameMapping = {
  /* E-Commerce Events */
  /* Browsing Section */
  products_searched: "search",
  product_list_viewed: "view_item_list",

  /* Promotions Section */
  promotion_viewed: "view_promotion",
  promotion_clicked: "select_promotion",

  /* Ordering Section */
  product_clicked: "select_item",
  product_viewed: "view_item",
  product_added: "add_to_cart",
  product_removed: "remove_from_cart",
  cart_viewed: "view_cart",
  checkout_started: "begin_checkout",
  payment_info_entered: "add_payment_info",
  /**
   * payment_info_entered: "add_shipping_info",
   * This event mapping is handled from transform.js
   */
  order_completed: "purchase",
  order_refunded: "refund",

  /* Wishlist Section */
  product_added_to_wishlist: "add_to_wishlist",

  /* Sharing Section */
  product_shared: "share",
  cart_shared: "share",

  /* Group */
  group: "join_group",

  /* GA4 Events */
  view_search_results: "view_search_results"
};

const mappingConfig = getMappingConfig(ConfigCategory, __dirname);

module.exports = {
  ENDPOINT,
  ConfigCategory,
  eventNameMapping,
  mappingConfig,
  trackCommonConfig: mappingConfig[ConfigCategory.COMMON.name]
};
