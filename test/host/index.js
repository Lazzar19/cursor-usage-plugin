const path = require("path");
const Mocha = require("mocha");

function run() {
  const mocha = new Mocha({ ui: "tdd", color: true, timeout: 30000 });
  mocha.addFile(path.join(__dirname, "extension.test.js"));
  return new Promise((resolve, reject) => {
    mocha.run((failures) => {
      if (failures > 0) {
        reject(new Error(`${failures} host test(s) failed`));
        return;
      }
      resolve();
    });
  });
}

module.exports = { run };
