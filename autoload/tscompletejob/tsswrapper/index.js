let argv = process.argv.slice(2);
let useLegacy = false;
argv.forEach((arg, idx) => {
    if (arg === "--useLegacy") {
        useLegacy = true
        argv.splice(idx, 1);
    }
});

if (useLegacy) {
    require("./legacy/tsswrapper").start(argv[0]);
} else {
    require("./lib/tsswrapper").start()
}
