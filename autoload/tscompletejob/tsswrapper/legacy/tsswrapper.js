exports.start = function (argv) {

    if (argv.length > 0) {
        var tsslib = argv[0];
    }
    else {
        var tsslib = __dirname + "/node_modules/typescript/lib/tsserverlibrary.js"
    }

    var ts = require(tsslib);

    if (ts.version.substring(0,3) === "2.0") {
        require("./tsswrapper200.js").start(tsslib)
    }
    else {
        require("./tsswrapper210.js").start(tsslib)
    }

}
