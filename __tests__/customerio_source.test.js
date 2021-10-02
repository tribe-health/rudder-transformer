const util = require("./util.js");

const integration = "customerio";
const name = "CustomerIO";

const transformer = util.getTransformer(integration, "source");

const { inputData, expectedData } = util.getJSONData(integration, "source");

inputData.forEach((input, index) => {
  it(`${name} Tests: payload: ${index}`, async () => {
    try {
      const output = await transformer.process(input);
      expect(output).toEqual(expectedData[index]);
    } catch (error) {
      expect(error.message).toEqual(expectedData[index].message);
    }
  });
});
