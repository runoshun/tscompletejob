if (process.argv.length > 2) {
    var tsslib = process.argv[2];
}
else {
    var tsslib = __dirname + "/node_modules/typescript/lib/tsserverlibrary.js"
}

var ts = require(tsslib);

if (ts.version.substring(0,3) === "2.0") {
    require("./tsswrapper200.js")
}
else {
    require("./tsswrapper210.js")
}
