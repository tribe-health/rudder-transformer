const ivm = require("isolated-vm");
const stats = require("./stats");

const { getPool } = require("./ivmPool");
const { getFactory } = require("./ivmFactory");
const { getMetadata } = require("../v0/util");
const logger = require("../logger");

async function transform(isolatevm, events) {
  const transformationPayload = {};
  transformationPayload.events = events;
  transformationPayload.transformationType = isolatevm.fName;
  const executionPromise = new Promise(async (resolve, reject) => {
    const sharedTransformationPayload = new ivm.ExternalCopy(
      transformationPayload
    ).copyInto({
      transferIn: true
    });
    try {
      await isolatevm.bootstrapScriptResult.apply(
        undefined,
        [
          isolatevm.fnRef,
          new ivm.Reference(resolve),
          new ivm.Reference(reject),
          sharedTransformationPayload
        ],
        { timeout: 4000 }
      );
    } catch (error) {
      reject(error.message);
    }
  });
  return executionPromise.catch(e => {
    throw new Error(e);
  });
}

function calculateMsFromIvmTime(value) {
  return (value[0] + value[1] / 1e9) * 1000;
}

// sample code
const sampleCode = `
function transformEvent(events) {
	return events;
}
`;

async function userTransformHandlerV1(
  events,
  userTransformation,
  libraryVersionIds,
  testMode = false
) {
  logger.info("isolate created");
  const isolate = new ivm.Isolate({ memoryLimit: 128 });
  const context = await isolate.createContext();
  const script = await isolate.compileScript(sampleCode);
  await script.run(context);

  // 2. run the code, and await the result
  const fnReference = await context.global.get("transformEvent");
  // Initializing the external copy variable
  const eventExtCopy = new ivm.ExternalCopy(events);
  // Copying into isolate
  const sharedTransformationPayload = eventExtCopy.copyInto({
    transferIn: true
  });
  const result = await fnReference.apply(undefined, [
    sharedTransformationPayload
  ]);

  // Releasing the ExternalCopy object
  eventExtCopy.release();
  // Releasing context
  context.release();
  // Disposing of isolate
  isolate.dispose();
  logger.info("isolate destroyed");
  return events;
}

exports.userTransformHandlerV1 = userTransformHandlerV1;
