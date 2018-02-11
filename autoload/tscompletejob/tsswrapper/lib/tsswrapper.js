"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : new P(function (resolve) { resolve(result.value); }).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const childProcess = require("child_process");
const os = require("os");
const readline = require("readline");
const utils_1 = require("./utils");
exports.start = (tsserverjs) => {
    let tsserver = tsserverjs;
    if (!tsserver) {
        tsserver = __dirname + "/../node_modules/typescript/lib/tsserver.js";
    }
    new WrapperServer(tsserver);
};
const debug = (...args) => {
    if (process.env.NODE_ENV === "debug") {
        console.warn.apply(console, args);
    }
};
const noResponseCommands = [
    "open",
];
class WrapperServer {
    constructor(tsserverjs) {
        this.handlers = {};
        this.resPromises = new utils_1.PromisePool();
        this.seq = 1000000;
        this.listenClient = () => {
            this.rl.on("line", (input) => {
                this.onMessageFromClient(input.trim());
            });
            this.rl.on("close", () => {
                setTimeout(() => process.exit(0), 1000);
            });
        };
        this.onMessageFromClient = (message) => __awaiter(this, void 0, void 0, function* () {
            debug("[client] > ", message);
            try {
                let req = JSON.parse(message);
                try {
                    let res = yield this.handleRequestFromClient(req);
                    if (res) {
                        this.outputToClient(res, req.command, req.seq, undefined);
                    }
                }
                catch (e) {
                    debug(e);
                    this.outputToClient(undefined, req.command, req.seq, e.message);
                }
            }
            catch (e) {
                debug(e);
                this.outputToClient(undefined, "error", 0, "invalid request");
            }
        });
        this.handleRequestFromClient = (req) => {
            let cmd = req.command;
            let customHandler = this.handlers[cmd];
            if (customHandler) {
                return customHandler(req);
            }
            else {
                return this.pipeClientReqToTsServer(req);
            }
        };
        this.outputToClient = (info, cmdName, reqSeq, errorMsg) => {
            if (reqSeq === void 0) {
                reqSeq = 0;
            }
            var res = {
                seq: 0,
                type: "response",
                command: cmdName,
                request_seq: reqSeq,
                success: !errorMsg,
            };
            if (!errorMsg) {
                res.body = info;
            }
            else {
                res.message = errorMsg;
            }
            debug("[client] < ", JSON.stringify(res));
            process.stdout.write(this.formatResponse(res));
        };
        this.formatResponse = function (msg) {
            var json = JSON.stringify(msg);
            var len = Buffer.byteLength(json, "utf8");
            return ("Content-Length: " + (1 + len) + "\r\n\r\n" + json + os.EOL);
        };
        this.startTsServer = (tsserverjs) => {
            let tsserver = childProcess.spawn(process.execPath, [tsserverjs], { stdio: ["pipe", "pipe", "pipe"] });
            let rl = readline.createInterface({
                input: tsserver.stdout,
                output: tsserver.stdin,
                terminal: false,
            });
            rl.on("line", (input) => {
                debug("[tss] > ", input);
                let message = input.trim();
                if (message && !message.match(/^Content-Length:/)) {
                    let res = JSON.parse(input);
                    if (res.type === "response") {
                        this.resPromises.resolve(res.request_seq, res);
                    }
                    else {
                        debug("input is not response, ", res);
                    }
                }
            });
            rl.on("close", () => {
                debug("tsserver stdout is closed");
                process.exit(0);
            });
            return tsserver;
        };
        this.pipeClientReqToTsServer = (req) => __awaiter(this, void 0, void 0, function* () {
            debug("[tss] < ", JSON.stringify(req));
            if (noResponseCommands.some(c => c === req.command)) {
                this.tsserver.stdin.write(JSON.stringify(req) + "\r\n");
            }
            else {
                let promise = this.resPromises.prepare(req.seq);
                this.tsserver.stdin.write(JSON.stringify(req) + "\r\n");
                let res = yield promise;
                let fres = this.formatResponse(res);
                debug("[client] < ", fres);
                process.stdout.write(fres);
            }
        });
        this.requestToTsServer = (command, args) => {
            let req = {
                type: "request",
                command: command.toString(),
                arguments: args,
                seq: this.seq++
            };
            let promise = this.resPromises.prepare(req.seq);
            debug("[tss] < ", JSON.stringify(req));
            this.tsserver.stdin.write(JSON.stringify(req) + "\r\n");
            return promise;
        };
        /// =============================== custom protocol handlers ===================================
        this.initProtocolHandlers = () => {
            const buildDocumentation = (dispParts, docs) => {
                if (!dispParts && !docs) {
                    return undefined;
                }
                let menu = "";
                if (dispParts) {
                    menu = dispParts.reduce((s, part) => {
                        if (part.kind != "lineBreak") {
                            s += part.text;
                        }
                        return s;
                    }, "");
                    menu = menu.replace(/\(\w+\)\s*/, "");
                }
                let info = "";
                if (docs) {
                    info = docs.reduce((s, doc) => {
                        s += "\n" + doc.text;
                        return s;
                    }, menu);
                }
                return { menu, info };
            };
            this.handlers["completionsForVim"] = (req) => __awaiter(this, void 0, void 0, function* () {
                let args = req.arguments;
                if (!args) {
                    throw new Error("invalid args");
                }
                let res = yield this.requestToTsServer("completions" /* Completions */, args);
                let completions = res.body || [];
                let enableDetail = args.enableDetail && completions.length < (args.maxDetailCount || Number.MAX_SAFE_INTEGER);
                let detailsMap = {};
                if (enableDetail) {
                    let entryNames = completions.map(item => item.name);
                    let detail_args = {
                        line: args.line,
                        offset: args.offset,
                        file: args.file,
                        entryNames: entryNames,
                    };
                    let res = yield this.requestToTsServer("completionEntryDetails" /* CompletionDetails */, detail_args);
                    let details = res.body || [];
                    details.forEach(item => {
                        detailsMap[item.name] = buildDocumentation(item.displayParts, item.documentation);
                    });
                }
                let entries = completions.map((item) => {
                    let entry = {
                        word: item.name,
                        kind: enableDetail ? item.kind.toString().substr(0, 1) : item.kind.toString()
                    };
                    let details = detailsMap[item.name];
                    if (details) {
                        entry.menu = details.menu;
                        entry.info = details.info;
                    }
                    return entry;
                });
                return entries;
            });
            const appendDisplayText = (s, displayPart) => {
                return s + displayPart.text;
            };
            const buildSignatureHelp = (disableDocumentation) => {
                return (item) => {
                    let prefix = item.prefixDisplayParts.reduce(appendDisplayText, "");
                    let suffix = item.suffixDisplayParts.reduce(appendDisplayText, "");
                    let separator = item.separatorDisplayParts.reduce(appendDisplayText, "");
                    let abbrs = [];
                    let docs = [];
                    item.parameters.forEach(param => {
                        let dispText = param.displayParts.reduce(appendDisplayText, "");
                        let docText = param.documentation.reduce(appendDisplayText, "");
                        abbrs.push(dispText);
                        docs.push(docText ? param.name + ": " + docText : "");
                    });
                    var sigDoc = item.documentation.reduce(appendDisplayText, "");
                    var abbr = prefix + abbrs.join(separator) + suffix;
                    var info = (sigDoc + "\n" + docs.join("\n")).trim();
                    return {
                        word: "",
                        abbr: abbr,
                        empty: true,
                        info: disableDocumentation === true ? undefined : info,
                        dup: true,
                    };
                };
            };
            this.handlers["signatureHelpForVim"] = (req) => __awaiter(this, void 0, void 0, function* () {
                let args = req.arguments;
                let res = yield this.requestToTsServer("signatureHelp" /* SignatureHelp */, args);
                let help = res.body;
                if (!help || !help.items || help.items.length == 0) {
                    return { response: "", responseRequired: true };
                }
                let onlyMatched = args.onlyMatched !== false;
                let items = help.items;
                if (onlyMatched) {
                    var argCount = help.argumentCount;
                    items = items.filter(function (item) { return item.parameters.length >= argCount; });
                }
                var helps = items.map(buildSignatureHelp(!!args.disableDocumentation));
                return helps;
            });
            this.handlers["qfixlistForVim"] = (req) => __awaiter(this, void 0, void 0, function* () {
                let args = req.arguments;
                let resSyntacticDiagnostics = yield this.requestToTsServer("syntacticDiagnosticsSync" /* SyntacticDiagnosticsSync */, args);
                let resSemanticDiagnostics = yield this.requestToTsServer("semanticDiagnosticsSync" /* SemanticDiagnosticsSync */, args);
                let diags = resSyntacticDiagnostics.body || [];
                diags.unshift.apply(diags, resSemanticDiagnostics.body || []);
                let qfixlist = diags.map((diag) => {
                    let dstart = diag.startLocation || diag.start;
                    let text = diag.message || diag.text;
                    let result = {
                        lnum: dstart.line,
                        col: dstart.offset,
                        text: text,
                        valid: 1,
                        filename: args.file,
                    };
                    return result;
                });
                return qfixlist;
            });
            this.handlers["referencesForVim"] = (req) => __awaiter(this, void 0, void 0, function* () {
                let args = req.arguments;
                let res = yield this.requestToTsServer("references" /* References */, args);
                let refs = res.body;
                if (refs) {
                    let items = refs.refs.sort((i1, i2) => (i2.isDefinition ? 1 : 0) - (i1.isDefinition ? 1 : 0));
                    var loclist = items.map((item) => {
                        return item.file + ":" + item.start.line + ":" + item.start.offset + ":" + item.lineText;
                    });
                    return loclist;
                }
                else {
                    return [];
                }
            });
            this.handlers["codeFixAtPositionForVim"] = (req) => __awaiter(this, void 0, void 0, function* () {
                debugger;
                let args = req.arguments;
                let resCodefixes = yield this.requestToTsServer("getSupportedCodeFixes" /* GetSupportedCodeFixes */, {});
                let resDiags = yield this.requestToTsServer("semanticDiagnosticsSync" /* SemanticDiagnosticsSync */, args);
                let codefixes = resCodefixes.body || [];
                let diags = resDiags.body || [];
                if (diags.length > 0) {
                    let diag = diags[0];
                    if (diag.code && codefixes.indexOf(diag.code.toString()) != -1) {
                        let dstart = diag.startLocation || diag.start;
                        let dend = diag.endLocation || diag.end;
                        let cfArgs = {
                            file: args.file,
                            errorCodes: [diag.code],
                            startLine: dstart.line,
                            startOffset: dstart.offset,
                            endLine: dend.line,
                            endOffset: dend.offset,
                        };
                        let res = yield this.requestToTsServer("getCodeFixes" /* GetCodeFixes */, cfArgs);
                        return res.body;
                    }
                }
                return [];
            });
        };
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: false,
        });
        this.tsserver = this.startTsServer(tsserverjs);
        this.listenClient();
        this.initProtocolHandlers();
    }
}
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHNzd3JhcHBlci5qcyIsInNvdXJjZVJvb3QiOiIiLCJzb3VyY2VzIjpbIi4uL3NyYy90c3N3cmFwcGVyLnRzIl0sIm5hbWVzIjpbXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7QUFBQSw4Q0FBOEM7QUFDOUMseUJBQXdCO0FBQ3hCLHFDQUFxQztBQVVyQyxtQ0FBc0M7QUFFekIsUUFBQSxLQUFLLEdBQUcsQ0FBQyxVQUFtQixFQUFFLEVBQUU7SUFDekMsSUFBSSxRQUFRLEdBQUcsVUFBVSxDQUFDO0lBQzFCLEVBQUUsQ0FBQyxDQUFDLENBQUMsUUFBUSxDQUFDLENBQUMsQ0FBQztRQUNaLFFBQVEsR0FBRyxTQUFTLEdBQUcsNkNBQTZDLENBQUM7SUFDekUsQ0FBQztJQUNELElBQUksYUFBYSxDQUFDLFFBQVEsQ0FBQyxDQUFDO0FBRWhDLENBQUMsQ0FBQTtBQUVELE1BQU0sS0FBSyxHQUFHLENBQUMsR0FBRyxJQUFXLEVBQUUsRUFBRTtJQUM3QixFQUFFLENBQUMsQ0FBQyxPQUFPLENBQUMsR0FBRyxDQUFDLFFBQVEsS0FBSyxPQUFPLENBQUMsQ0FBQyxDQUFDO1FBQ25DLE9BQU8sQ0FBQyxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sRUFBRSxJQUFJLENBQUMsQ0FBQztJQUN0QyxDQUFDO0FBQ0wsQ0FBQyxDQUFBO0FBRUQsTUFBTSxrQkFBa0IsR0FBRztJQUN2QixNQUFNO0NBQ1QsQ0FBQztBQUVGO0lBT0ksWUFBWSxVQUFrQjtRQU50QixhQUFRLEdBQTBELEVBQUUsQ0FBQztRQUNyRSxnQkFBVyxHQUEwQixJQUFJLG1CQUFXLEVBQVksQ0FBQztRQUVqRSxRQUFHLEdBQUcsT0FBTyxDQUFDO1FBY2QsaUJBQVksR0FBRyxHQUFHLEVBQUU7WUFDeEIsSUFBSSxDQUFDLEVBQUUsQ0FBQyxFQUFFLENBQUMsTUFBTSxFQUFFLENBQUMsS0FBSyxFQUFFLEVBQUU7Z0JBQ3pCLElBQUksQ0FBQyxtQkFBbUIsQ0FBQyxLQUFLLENBQUMsSUFBSSxFQUFFLENBQUMsQ0FBQztZ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