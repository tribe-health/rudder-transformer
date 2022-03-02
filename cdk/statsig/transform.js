function dummyPostMapper(event, mappedPayload, rudderContext) {
  const keys = [ 'delKey1', 'delKey2' ]
  keys.forEach(k => {
    delete event.message[k];
  });
  rudderContext.someKey = "someVal";
  return mappedPayload;
}

module.exports = { dummyPostMapper };
