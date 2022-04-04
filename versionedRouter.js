/* eslint-disable import/no-dynamic-require */
/* eslint-disable global-require */
const Router = require("koa-router");
const _ = require("lodash");
// const { ConfigFactory, Executor } = require("rudder-transformer-cdk");
const logger = require("./logger");
const stats = require("./util/stats");

//req
const { isNonFuncObject, getMetadata } = require("./v0/util");
const { userTransformHandler } = require("./routerUtils");
require("dotenv").config();
const { prometheusRegistry } = require("./middleware");
// const basePath = path.resolve(__dirname, "./cdk");
// ConfigFactory.init({ basePath, loggingMode: "production" });

const API_VERSION = "2";

const router = new Router();


let areFunctionsEnabled = -1;
const functionsEnabled = () => {
  if (areFunctionsEnabled === -1) {
    areFunctionsEnabled = process.env.ENABLE_FUNCTIONS === "false" ? 0 : 1;
  }
  return areFunctionsEnabled === 1;
};

if (functionsEnabled()) {
  router.post("/customTransform", async ctx => {
    const startTime = new Date();
    const events = ctx.request.body;
    const { processSessions } = ctx.query;
    logger.debug(`[CT] Input events: ${JSON.stringify(events)}`);
    stats.counter("user_transform_input_events", events.length, {
      processSessions
    });
    let groupedEvents;
    if (processSessions) {
      groupedEvents = _.groupBy(events, event => {
        // to have the backward-compatibility and being extra careful. We need to remove this (message.anonymousId) in next release.
        const rudderId = event.metadata.rudderId || event.message.anonymousId;
        return `${event.destination.ID}_${event.metadata.sourceId}_${rudderId}`;
      });
    } else {
      groupedEvents = _.groupBy(
        events,
        event => `${event.metadata.destinationId}_${event.metadata.sourceId}`
      );
    }
    stats.counter(
      "user_transform_function_group_size",
      Object.entries(groupedEvents).length,
      { processSessions }
    );

    const transformedEvents = [];
    let librariesVersionIDs = [];
    if (events[0].libraries) {
      librariesVersionIDs = events[0].libraries.map(
        library => library.VersionID
      );
    }
    await Promise.all(
      Object.entries(groupedEvents).map(async ([dest, destEvents]) => {
        logger.debug(`dest: ${dest}`);
        const transformationVersionId =
          destEvents[0] &&
          destEvents[0].destination &&
          destEvents[0].destination.Transformations &&
          destEvents[0].destination.Transformations[0] &&
          destEvents[0].destination.Transformations[0].VersionID;
        const messageIds = destEvents.map(
          ev => ev.metadata && ev.metadata.messageId
        );
        const commonMetadata = {
          sourceId: destEvents[0].metadata && destEvents[0].metadata.sourceId,
          destinationId:
            destEvents[0].metadata && destEvents[0].metadata.destinationId,
          destinationType:
            destEvents[0].metadata && destEvents[0].metadata.destinationType,
          messageIds
        };

        const metaTags =
          destEvents.length && destEvents[0].metadata
            ? getMetadata(destEvents[0].metadata)
            : {};
        const userFuncStartTime = new Date();
        if (transformationVersionId) {
          let destTransformedEvents;
          try {
            stats.counter(
              "user_transform_function_input_events",
              destEvents.length,
              {
                processSessions,
                ...metaTags
              }
            );
            destTransformedEvents = await userTransformHandler()(
              destEvents,
              transformationVersionId,
              librariesVersionIDs
            );
            transformedEvents.push(
              ...destTransformedEvents.map(ev => {
                if (ev.error) {
                  return {
                    statusCode: 400,
                    error: ev.error,
                    metadata: _.isEmpty(ev.metadata)
                      ? commonMetadata
                      : ev.metadata
                  };
                }
                if (!isNonFuncObject(ev.transformedEvent)) {
                  return {
                    statusCode: 400,
                    error: `returned event in events from user transformation is not an object. transformationVersionId:${transformationVersionId} and returned event: ${JSON.stringify(
                      ev.transformedEvent
                    )}`,
                    metadata: _.isEmpty(ev.metadata)
                      ? commonMetadata
                      : ev.metadata
                  };
                }
                return {
                  output: ev.transformedEvent,
                  metadata: _.isEmpty(ev.metadata)
                    ? commonMetadata
                    : ev.metadata,
                  statusCode: 200
                };
              })
            );
          } catch (error) {
            logger.error(error);
            const errorString = error.toString();
            destTransformedEvents = destEvents.map(e => {
              return {
                statusCode: 400,
                metadata: e.metadata,
                error: errorString
              };
            });
            transformedEvents.push(...destTransformedEvents);
            stats.counter("user_transform_errors", destEvents.length, {
              transformationVersionId,
              processSessions,
              ...metaTags
            });
          } finally {
            stats.timing("user_transform_function_latency", userFuncStartTime, {
              transformationVersionId,
              processSessions,
              ...metaTags
            });
          }
        } else {
          const errorMessage = "Transformation VersionID not found";
          logger.error(`[CT] ${errorMessage}`);
          transformedEvents.push({
            statusCode: 400,
            error: errorMessage,
            metadata: commonMetadata
          });
          stats.counter("user_transform_errors", destEvents.length, {
            transformationVersionId,
            processSessions,
            ...metaTags
          });
        }
      })
    );
    logger.debug(`[CT] Output events: ${JSON.stringify(transformedEvents)}`);
    ctx.body = transformedEvents;
    ctx.set("apiVersion", API_VERSION);
    stats.timing("user_transform_request_latency", startTime, {
      processSessions
    });
    stats.increment("user_transform_requests", 1, { processSessions });
    stats.counter("user_transform_output_events", transformedEvents.length, {
      processSessions
    });
  });
}

router.get("/health", ctx => {
  ctx.body = "OK";
});

const metricsController = async ctx => {
  ctx.status = 200;
  ctx.type = prometheusRegistry.contentType;
  ctx.body = await prometheusRegistry.metrics();
  return ctx.body;
};

router.get("/metrics", async ctx => {
  await metricsController(ctx);
});

module.exports = {
  router
};
