const fs = require("fs");
const path = require("path");
const utilObj = require("../../v0/util");

const functionsToTest = ["handleSourceKeysOperation"];

describe ("Integration Util Tests", () => {
  functionsToTest.forEach(fn => {
    describe(`Test - ${fn}`, () => {
      const fnObj = utilObj[fn];

      // common for all the methods
      it(`${fn} is defined`, () => {
        expect(fnObj).not.toBeNull();
      });

      // get the data file for the function
      const inputFile = fs.readFileSync(
        path.resolve(__dirname, `./data/${fn}.json`)
      );
      const inputData = JSON.parse(inputFile);

      inputData.forEach(dataPoint => {
        const {input, output, description} = dataPoint;
        it (description, () => {
          const result = fnObj({...input});
          if (output === null) {
            expect(result).toBeNull();
          } else {
            expect(result).toEqual(output);
          }
        });
      });
    });
  });
});
