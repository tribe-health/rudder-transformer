const { readdirSync } = require("fs");
const path = require("path");
const fs = require("fs");

const compareJSON = (obj1, obj2) => {
  const ret = {};
  for (const i in obj2) {
    if (!obj1.hasOwnProperty(i) || obj2[i] !== obj1[i]) {
      ret[i] = obj2[i];
    }
  }
  return ret;
};

/**
 *
 * @param {*} integration - Name of the integration
 * @param {*} type - Type of integration ("source", "destination")
 * @returns
 */
const getJSONData = (integration, type = "destination") => {
  if (type == "source") type = "source_";
  else if (type === "destination") type = "";

  const inputDataFile = fs.readFileSync(
    path.resolve(__dirname, `./data/${integration}_${type}input.json`)
  );
  const outputDataFile = fs.readFileSync(
    path.resolve(__dirname, `./data/${integration}_${type}output.json`)
  );

  const inputData = JSON.parse(inputDataFile);
  const expectedData = JSON.parse(outputDataFile);

  return { inputData, expectedData };
};

/**
 *
 * @param {*} integration - Name of the integration
 * @param {*} type - Type of integration ("source", "destination")
 * @param {*} version - Transformer version
 * @returns
 */
const getTransformer = (integration, type = "destination", version = "v0") => {
  if (type == "source") type = "sources";
  else if (type === "destination") type = "destinations";

  return require(`../${version}/${type}/${integration}/transform`);
};

const getDirectories = source =>
  readdirSync(source, { withFileTypes: true })
    .filter(dirent => dirent.isDirectory())
    .map(dirent => dirent.name);

module.exports = {
  compareJSON,
  getDirectories,
  getJSONData,
  getTransformer
};
