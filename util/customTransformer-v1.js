const ivm = require("isolated-vm");
const { default: fetch } = require("node-fetch");
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

const codeWithWrapper = `export default function add(a, b) { return a + b; };"This is awesome!";`;

// sample code
const sampleCode = `

global.fetch = function(...args) {
  // We use 'copyInto()' here so that on the other side we don't have to call 'copy()'. It
  // doesn't make a difference who requests the copy, the result is the same.
  // 'applyIgnored' calls 'log' asynchronously but doesn't return a promise-- it ignores the
  // return value or thrown exception from 'log'.
  log("Soem shit happening here.......");
  return new Promise(resolve => {
    fet.applyIgnored(undefined, [
      new _ivm.Reference(resolve),
      ...args.map(arg => new _ivm.ExternalCopy(arg).copyInto())
    ]);
  });
};

async function transformEvent(events) {
  log("inside isolate transformEvent");
  const fetchProm = fetch('https://jsonplaceholder.typicode.com/comments/1');
  const result = await fetchProm;
  log("Here see me!!!");
  log("Result", result);
	return {
    result,
    events
  };
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

  const jail = context.global;
  jail.set("_ivm", ivm);
  jail.setSync("global", jail.derefInto());
  jail.setSync("log", function(...args) {
    console.log(...args);
  });
  await jail.set(
    "fet",
    new ivm.Reference(async (resolve, ...args) => {
      try {
        const res = await fetch(...args);
        const data = await res.json();
        resolve.applyIgnored(undefined, [
          new ivm.ExternalCopy(data).copyInto()
        ]);
      } catch (error) {
        console.log("Inside Ref Err", error);
        resolve.applyIgnored(undefined, [
          new ivm.ExternalCopy("ERROR").copyInto()
        ]);
      }
    })
  );

  const script = await isolate.compileScript(sampleCode);
  await script.run(context);

  // module
  const customScriptModule = await isolate.compileModule(`${codeWithWrapper}`);
  await customScriptModule.instantiate(
    context,
    (specifier, referrer) => referrer
  );
  await customScriptModule.evaluate();

  // 2. run the code, and await the result
  const fnReference = await context.global.get("transformEvent", {
    promise: true,
    reference: true
  });
  // Initializing the external copy variable
  const eventExtCopy = new ivm.ExternalCopy(events);
  // Copying into isolate
  const sharedTransformationPayload = eventExtCopy.copyInto({
    transferIn: true
  });
  const result = fnReference.applySync(undefined, [
    sharedTransformationPayload
  ]);

  // Release Module
  customScriptModule.release();
  // // Release script
  script.release();
  // // Releasing the ExternalCopy object
  eventExtCopy.release();
  // Releasing context
  context.release();
  // Disposing of isolate
  isolate.dispose();
  logger.info("isolate destroyed");
  return events;
}

exports.userTransformHandlerV1 = userTransformHandlerV1;
