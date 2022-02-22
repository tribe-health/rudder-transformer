const fs = require('fs');
const _ = require('lodash');
const path = require("path");

function formTestParams(dest, transformAt) {
	const version = "v0";
  
  const transformer = require(
    path.resolve(__dirname + `../../../${version}/destinations/${dest}/transform`)
  );
  
  //for router test
  let trCat = '';
  if (transformAt === 'router') {
    trCat += 'router_'
  }
  const inputDataFile = fs.readFileSync(
    path.resolve(__dirname, `../data/${dest}_${trCat}input.json`)
  );
  const outputDataFile = fs.readFileSync(
    path.resolve(__dirname, `../data/${dest}_${trCat}output.json`)
  );
  const inputData = JSON.parse(inputDataFile);
  const expected = JSON.parse(outputDataFile);
	// const cdkDest = cdkDestinations.filter(({ name }) => name === dest)[0];
	return {
		input: inputData,
		expected,
		transformer,
		iscdkDest: false
	};
}

function executeTransformationTest(dest, transformAt) {
  const testParams = formTestParams(dest, transformAt);
  const { iscdkDest, transformer, expected, input } = testParams;
  describe(`${dest} Tests`, () => {
    it(`${dest} - ${transformAt} tests`, async () => {
      let actualData = [];
			if (!iscdkDest) {
	      if (transformAt === 'processor') {
	        actualData = input.map(inp => {
            try {
              return transformer.process(inp)
            } catch (error) {
              return error.message
            }
          })
          actualData.map((actData, index) => {
            if (expected[index].error) {
              expect(actData).toEqual(expected[index].error);
            } else {
              expect(actData).toEqual(expected[index])
            }
          })
	      } else {
          actualData = await transformer.processRouterDest(input)
          expect(actualData).toEqual(expected)
	      }
			} else {
        // TODO: execute the test from a util function exposed by CDK
				// actualData = executeTranformationTest(dest);
			}
      
    });
  });
}

module.exports = { executeTransformationTest };