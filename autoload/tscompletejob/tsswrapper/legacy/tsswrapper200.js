exports.start = function (tsslib) {

    const ts = require(tsslib)
    const readline = require("readline");
    const fs = require("fs");
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
        terminal: false
    });

    var __extends = (this && this.__extends) || function (d, b) {
        for (var p in b) if (b.hasOwnProperty(p)) d[p] = b[p];
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
    var Logger = (function () {
        function Logger(logFilename, level) {
            this.logFilename = logFilename;
            this.level = level;
            this.fd = -1;
            this.seq = 0;
            this.inGroup = false;
            this.firstInGroup = true;
        }
        Logger.padStringRight = function (str, padding) {
            return (str + padding).slice(0, padding.length);
        };
        Logger.prototype.close = function () {
            if (this.fd >= 0) {
                fs.close(this.fd);
            }
        };
        Logger.prototype.perftrc = function (s) {
            this.msg(s, "Perf");
        };
        Logger.prototype.info = function (s) {
            this.msg(s, "Info");
        };
        Logger.prototype.startGroup = function () {
            this.inGroup = true;
            this.firstInGroup = true;
        };
        Logger.prototype.endGroup = function () {
            this.inGroup = false;
            this.seq++;
            this.firstInGroup = true;
        };
        Logger.prototype.loggingEnabled = function () {
            return !!this.logFilename;
        };
        Logger.prototype.isVerbose = function () {
            return this.loggingEnabled() && (this.level == "verbose");
        };
        Logger.prototype.msg = function (s, type) {
            if (type === void 0) { type = "Err"; }
            if (this.fd < 0) {
                if (this.logFilename) {
                    this.fd = fs.openSync(this.logFilename, "w");
                }
            }
            if (this.fd >= 0) {
                s = s + "\n";
                var prefix = Logger.padStringRight(type + " " + this.seq.toString(), "          ");
                if (this.firstInGroup) {
                    s = prefix + s;
                    this.firstInGroup = false;
                }
                if (!this.inGroup) {
                    this.seq++;
                    this.firstInGroup = true;
                }
                var buf = new Buffer(s);
                fs.writeSync(this.fd, buf, 0, buf.length, null);
            }
        };
        return Logger;
    }());

    var IOSession = (function (_super) {
        __extends(IOSession, _super);
        function IOSession(host, logger) {
            _super.call(this, host, Buffer.byteLength, process.hrtime, logger);
        }
        IOSession.prototype.exit = function () {
            this.projectService.log("Exiting...", "Info");
            this.projectService.closeLog();
            process.exit(0);
        };
        IOSession.prototype.listen = function () {
            var _this = this;
            rl.on("line", function (input) {
                var message = input.trim();
                _this.onMessage(message);
            });
            rl.on("close", function () {
                _this.exit();
            });
        };
        return IOSession;
    }(ts.server.Session));

    function parseLoggingEnvironmentString(logEnvStr) {
        var logEnv = {};
        var args = logEnvStr.split(" ");
        for (var i = 0, len = args.length; i < (len - 1); i += 2) {
            var option = args[i];
            var value = args[i + 1];
            if (option && value) {
                switch (option) {
                    case "-file":
                        logEnv.file = value;
                        break;
                    case "-level":
                        logEnv.detailLevel = value;
                        break;
                }
            }
        }
        return logEnv;
    }

    function createLoggerFromEnv() {
        var fileName = undefined;
        var detailLevel = "normal";
        var logEnvStr = process.env["TSS_LOG"];
        if (logEnvStr) {
            var logEnv = parseLoggingEnvironmentString(logEnvStr);
            if (logEnv.file) {
                fileName = logEnv.file;
            }
            else {
                fileName = __dirname + "/.log" + process.pid.toString();
            }
            if (logEnv.detailLevel) {
                detailLevel = logEnv.detailLevel;
            }
        }
        return new Logger(fileName, detailLevel);
    }

    function createPollingWatchedFileSet(interval, chunkSize) {
        if (interval === void 0) { interval = 2500; }
        if (chunkSize === void 0) { chunkSize = 30; }
        var watchedFiles = [];
        var nextFileToCheck = 0;
        var watchTimer;
        function getModifiedTime(fileName) {
            return fs.statSync(fileName).mtime;
        }
        function poll(checkedIndex) {
            var watchedFile = watchedFiles[checkedIndex];
            if (!watchedFile) {
                return;
            }
            fs.stat(watchedFile.fileName, function (err, stats) {
                if (err) {
                    watchedFile.callback(watchedFile.fileName);
                }
                else if (watchedFile.mtime.getTime() !== stats.mtime.getTime()) {
                    watchedFile.mtime = getModifiedTime(watchedFile.fileName);
                    watchedFile.callback(watchedFile.fileName, watchedFile.mtime.getTime() === 0);
                }
            });
        }
        function startWatchTimer() {
            watchTimer = setInterval(function () {
                var count = 0;
                var nextToCheck = nextFileToCheck;
                var firstCheck = -1;
                while ((count < chunkSize) && (nextToCheck !== firstCheck)) {
                    poll(nextToCheck);
                    if (firstCheck < 0) {
                        firstCheck = nextToCheck;
                    }
                    nextToCheck++;
                    if (nextToCheck === watchedFiles.length) {
                        nextToCheck = 0;
                    }
                    count++;
                }
                nextFileToCheck = nextToCheck;
            }, interval);
        }
        function addFile(fileName, callback) {
            var file = {
                fileName: fileName,
                callback: callback,
                mtime: getModifiedTime(fileName)
            };
            watchedFiles.push(file);
            if (watchedFiles.length === 1) {
                startWatchTimer();
            }
            return file;
        }
        function removeFile(file) {
            watchedFiles = ts.copyListRemovingItem(file, watchedFiles);
        }
        return {
            getModifiedTime: getModifiedTime,
            poll: poll,
            startWatchTimer: startWatchTimer,
            addFile: addFile,
            removeFile: removeFile
        };
    }

    function startTsServer(extend) {
        var pollingWatchedFileSet = createPollingWatchedFileSet();
        var logger = createLoggerFromEnv();
        var pending = [];
        var canWrite = true;
        function writeMessage(s) {
            if (!canWrite) {
                pending.push(s);
            }
            else {
                canWrite = false;
                process.stdout.write(new Buffer(s, "utf8"), setCanWriteFlagAndWriteMessageIfNecessary);
            }
        }
        function setCanWriteFlagAndWriteMessageIfNecessary() {
            canWrite = true;
            if (pending.length) {
                writeMessage(pending.shift());
            }
        }
        var sys = ts.sys;
        sys.write = function (s) { return writeMessage(s); };
        sys.watchFile = function (fileName, callback) {
            var watchedFile = pollingWatchedFileSet.addFile(fileName, callback);
            return {
                close: function () { return pollingWatchedFileSet.removeFile(watchedFile); }
            };
        };
        sys.setTimeout = setTimeout;
        sys.clearTimeout = clearTimeout;
        var ioSession = new IOSession(sys, logger);
        process.on("uncaughtException", function (err) {
            ioSession.logError(err, "unknown");
        });
        extend(ioSession);
        ioSession.listen();
    }

    const os = require("os");
    startTsServer(function (server) {

        var buildDocumentation = function(dispParts, docs) {
            if(!dispParts && !docs) {
                return undefined;
            }

            var menu;
            if (dispParts) {
                menu = dispParts.reduce(function(s, part) {
                    if (part.kind != "lineBreak") {
                        s += part.text;
                    }
                    return s;
                }, "");
                menu = menu.replace(/\(\w+\)\s*/, "");
            }

            var info;
            if (docs) {
                info = docs.reduce(function(s, doc) {
                    s += "\n" + doc.text;
                    return s;
                }, menu ? menu : "");
            }

            return {
                menu: menu,
                info: info
            };
        };

        function appendDisplayText(s, displayPart) {
            return s + displayPart.text;
        }

        server.addProtocolHandler("completionsForVim", function (request) {
            var args = request.arguments;
            var completions = server.getCompletions(args.line, args.offset, args.prefix, args.file);

            var prefixLength = args.prefix.length;
            var filtered = completions.filter(function (item) { return args.prefix === item.name.substr(0, prefixLength)});

            var enableDetail = args.enableDetail && filtered.length < args.maxDetailCount;

            var detailsMap = {};
            if (enableDetail) {
                completions = filtered;
                var entryNames = completions.map(function (item) { return item.name; });
                var details = server.getCompletionEntryDetails(args.line, args.offset, entryNames, args.file);
                var detailsMap = details.reduce(function (map, item) {
                    var docs = buildDocumentation(item.displayParts, item.documentation)
                    if (docs) {
                        map[item.name] = {
                            menu: docs.menu,
                            info: docs.info
                        }
                    }
                    return map;
                }, {});
            }

            var results = completions.map(function (item) {
                var result = { };
                result.word = item.name;
                result.kind = enableDetail ? item.kind.substr(0,1) : item.kind;

                var details = detailsMap[item.name];
                if (details) {
                    result.menu = details.menu;
                    result.info = details.info;
                }
                return result;
            });

            return {
                response: results,
                responseRequired: true
            };
        });

        function buildSignatureHelp(disableDocumentation){
            return function(item) {
                var prefix = item.prefixDisplayParts.reduce(appendDisplayText, "");
                var suffix = item.suffixDisplayParts.reduce(appendDisplayText, "");
                var separator = item.separatorDisplayParts.reduce(appendDisplayText, "");
                var params = item.parameters.reduce(function(acc, param) {
                    var dispText = param.displayParts.reduce(appendDisplayText, "");
                    var docText = param.documentation.reduce(appendDisplayText, "");
                    acc[0].push(dispText);
                    acc[1].push(docText ? param.name + ": " + docText : "");
                    return acc;
                }, [[],[]]);

                var sigDoc = item.documentation.reduce(appendDisplayText, "");

                var abbr = prefix + params[0].join(separator) + suffix;
                var info = (sigDoc + "\n" + params[1].join("\n")).trim();

                return {
                    word: "",
                    abbr: abbr,
                    empty: true,
                    info: disableDocumentation === true ? undefined : info,
                    dup: true,
                };
            }
        }

        server.addProtocolHandler("signatureHelpForVim", function(request) {
            var args = request.arguments;

            var help = server.getSignatureHelpItems(args.line, args.offset, args.file);
            if (!help || !help.items || help.items.length == 0) {
                return { response: "", responseRequired: true };
            }

            var onlyMatched = args.onlyMatched !== false;
            var items = help.items;
            if (onlyMatched) {
                var argCount = help.argumentCount;
                items = items.filter(function(item) { return item.parameters.length >= argCount; });
            }
            var helps = items.map(buildSignatureHelp(args.disableDocumentation));

            return {
                response: helps,
                responseRequired: true
            };
        });

        server.addProtocolHandler("qfixlistForVim", function(request) {
            var args = request.arguments;

            var syntacticDiagnostics = server.getSyntacticDiagnosticsSync(args);
            var semanticDiagnostics = server.getSemanticDiagnosticsSync(args);

            var diags = [].concat(syntacticDiagnostics, semanticDiagnostics);
            var qfixlist = diags.map(function (diag) {
                return {
                    lnum : diag.start.line,
                    col : diag.start.offset,
                    text : diag.text,
                    valid : 1,
                    filename : args.file,
                };
            });

            return {
                response: qfixlist,
                responseRequired: true,
            };
        });

        server.addProtocolHandler("referencesForVim", function(request) {
            var args = request.arguments;

            var refs = server.getReferences(args.line, args.offset, args.file);
            if (refs) {
                var items = refs.refs.sort(function(i1, i2) {
                    return i2.isDefinition - i1.isDefinition;
                });
                var loclist = items.map(function(item) {
                    return item.file + ":" + item.start.line + ":" +
                        item.start.offset + ":" + item.lineText;
                });
                return { response: loclist, responseRequired: true };
            }
            else {
                return { response: [], responseRequired : true };
            }
        });
    });

};

