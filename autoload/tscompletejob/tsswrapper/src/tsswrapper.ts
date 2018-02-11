import * as childProcess from "child_process";
import * as os from "os"
import * as readline from "readline";
import * as proto from "typescript/lib/protocol";
import { Request, Response } from "typescript/lib/protocol";

import {
    CompletionsForVimRequestArgs, VimCompletionEntry,
    VimMenuInfo, SignatureHelpForVimRequestArgs,
    VimQfixlistItem
} from "./custom_protocol";

import { PromisePool } from "./utils";

export const start = (tsserverjs?: string) => {
    let tsserver = tsserverjs;
    if (!tsserver) {
        tsserver = __dirname + "/../node_modules/typescript/lib/tsserver.js";
    }
    new WrapperServer(tsserver);

}

const debug = (...args: any[]) => {
    if (process.env.NODE_ENV === "debug") {
        console.warn.apply(console, args);
    }
}

const noResponseCommands = [
    "open",
];

class WrapperServer {
    private handlers: { [command: string]: (req: Request) => Promise<any> } = {};
    private resPromises: PromisePool<Response> = new PromisePool<Response>();
    private tsserver: childProcess.ChildProcess;
    private seq = 1000000;
    private rl: readline.ReadLine;

    constructor(tsserverjs: string) {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
            terminal: false,
        });
        this.tsserver = this.startTsServer(tsserverjs);
        this.listenClient();
        this.initProtocolHandlers();
    }

    private listenClient = () => {
        this.rl.on("line", (input) => {
            this.onMessageFromClient(input.trim());
        });
        this.rl.on("close", () => {
            setTimeout(() => process.exit(0), 1000);
        });
    }

    private onMessageFromClient = async (message: string) => {
        debug("[client] > ", message);
        try {
            let req: Request = JSON.parse(message);
            try {
                let res: any = await this.handleRequestFromClient(req);
                if (res) {
                    this.outputToClient(res, req.command, req.seq, undefined)
                }
            } catch (e) {
                debug(e);
                this.outputToClient(undefined, req.command, req.seq, e.message);
            }
        } catch (e) {
            debug(e);
            this.outputToClient(undefined, "error", 0, "invalid request");
        }
    }

    private handleRequestFromClient = (req: Request) => {
        let cmd = req.command;
        let customHandler = this.handlers[cmd];
        if (customHandler) {
            return customHandler(req);
        } else {
            return this.pipeClientReqToTsServer(req);
        }
    }

    private outputToClient = (info: any, cmdName: string, reqSeq: number, errorMsg?: string) => {
        if (reqSeq === void 0) { reqSeq = 0; }
        var res: Response = {
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
        process.stdout.write(this.formatResponse(res))
    };

    private formatResponse = function(msg: Response) {
        var json = JSON.stringify(msg);
        var len = Buffer.byteLength(json, "utf8");
        return ("Content-Length: " + (1 + len) + "\r\n\r\n" + json + os.EOL);
    }

    private startTsServer = (tsserverjs: string) => {
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
                let res: Response = JSON.parse(input);
                if (res.type === "response") {
                    this.resPromises.resolve(res.request_seq, res);
                } else {
                    debug("input is not response, ", res);
                }
            }
        });
        rl.on("close", () => {
            debug("tsserver stdout is closed");
            process.exit(0);
        })
        return tsserver;
    }

    private pipeClientReqToTsServer = async (req: Request) => {
        debug("[tss] < ", JSON.stringify(req));
        if (noResponseCommands.some(c => c === req.command)) {
            this.tsserver.stdin.write(JSON.stringify(req) + "\r\n");
        } else {
            let promise = this.resPromises.prepare(req.seq);
            this.tsserver.stdin.write(JSON.stringify(req) + "\r\n");

            let res = await promise
            let fres = this.formatResponse(res);
            debug("[client] < ", fres);
            process.stdout.write(fres);
        }
    }

    private requestToTsServer = (command: proto.CommandTypes, args: any): Promise<Response> => {
        let req: Request = {
            type: "request",
            command: command.toString(),
            arguments: args,
            seq: this.seq++
        };
        let promise = this.resPromises.prepare(req.seq);
        debug("[tss] < ", JSON.stringify(req));
        this.tsserver.stdin.write(JSON.stringify(req) + "\r\n");
        return promise;
    }

    /// =============================== custom protocol handlers ===================================

    private initProtocolHandlers = () => {

        const buildDocumentation = (dispParts: proto.SymbolDisplayPart[], docs: proto.SymbolDisplayPart[]): VimMenuInfo | undefined => {
            if(!dispParts && !docs) {
                return undefined;
            }

            let menu: string = "";
            if (dispParts) {
                menu = dispParts.reduce((s: string, part: proto.SymbolDisplayPart) => {
                    if (part.kind != "lineBreak") {
                        s += part.text;
                    }
                    return s;
                }, "");
                menu = menu.replace(/\(\w+\)\s*/, "");
            }

            let info: string = "";
            if (docs) {
                info = docs.reduce((s: string, doc: proto.SymbolDisplayPart) => {
                    s += "\n" + doc.text;
                    return s;
                }, menu);
            }

            return { menu, info };
        };

        this.handlers["completionsForVim"] = async (req: Request) => {
            let args: CompletionsForVimRequestArgs = req.arguments;
            if (!args) {
                throw new Error("invalid args");
            }
            let res: proto.CompletionsResponse = await this.requestToTsServer(
                proto.CommandTypes.Completions,
                args
            );
            let completions = res.body || [];
            let enableDetail = args.enableDetail && completions.length < (args.maxDetailCount || Number.MAX_SAFE_INTEGER);

            let detailsMap: { [name: string]: VimMenuInfo | undefined } = {};
            if (enableDetail) {
                let entryNames = completions.map(item => item.name);
                let detail_args: proto.CompletionDetailsRequestArgs = {
                    line: args.line,
                    offset: args.offset,
                    file: args.file,
                    entryNames: entryNames,
                };
                let res: proto.CompletionDetailsResponse  = await this.requestToTsServer(
                    proto.CommandTypes.CompletionDetails,
                    detail_args
                )
                let details = res.body || [];
                details.forEach(item => {
                    detailsMap[item.name] = buildDocumentation(item.displayParts, item.documentation)
                })
            }

            let entries: VimCompletionEntry[] = completions.map((item) => {
                let entry: VimCompletionEntry = {
                    word: item.name,
                    kind: enableDetail ? item.kind.toString().substr(0,1) : item.kind.toString()
                };
                let details = detailsMap[item.name];
                if (details) {
                    entry.menu = details.menu;
                    entry.info = details.info;
                }
                return entry;
            });

            return entries;
        }

        const appendDisplayText = (s: string, displayPart: proto.SymbolDisplayPart) => {
            return s + displayPart.text;
        }

        const buildSignatureHelp = (disableDocumentation: boolean) => {
            return (item: proto.SignatureHelpItem) => {
                let prefix = item.prefixDisplayParts.reduce(appendDisplayText, "");
                let suffix = item.suffixDisplayParts.reduce(appendDisplayText, "");
                let separator = item.separatorDisplayParts.reduce(appendDisplayText, "");

                let abbrs: string[] = [];
                let docs: string[] = []
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
            }
        };

        this.handlers["signatureHelpForVim"] = async (req) => {
            let args: SignatureHelpForVimRequestArgs = req.arguments;
            let res: proto.SignatureHelpResponse = await this.requestToTsServer(
                proto.CommandTypes.SignatureHelp,
                args
            );
            let help = res.body;
            if (!help || !help.items || help.items.length == 0) {
                return { response: "", responseRequired: true };
            }

            let onlyMatched = args.onlyMatched !== false;
            let items = help.items;
            if (onlyMatched) {
                var argCount = help.argumentCount;
                items = items.filter(function(item) { return item.parameters.length >= argCount; });
            }
            var helps = items.map(buildSignatureHelp(!!args.disableDocumentation));
            return helps;
        };


        this.handlers["qfixlistForVim"] = async (req) => {
            let args = req.arguments;

            let resSyntacticDiagnostics: proto.SyntacticDiagnosticsSyncResponse = await this.requestToTsServer(
                proto.CommandTypes.SyntacticDiagnosticsSync,
                args
            );
            let resSemanticDiagnostics: proto.SemanticDiagnosticsSyncResponse = await this.requestToTsServer(
                proto.CommandTypes.SemanticDiagnosticsSync,
                args,
            );

            let diags: (proto.Diagnostic | proto.DiagnosticWithLinePosition)[] = resSyntacticDiagnostics.body || [];
            diags.unshift.apply(diags, resSemanticDiagnostics.body || []);

            let qfixlist = diags.map((diag) => {
                let dstart = (diag as proto.DiagnosticWithLinePosition).startLocation || diag.start;
                let text = (diag as proto.DiagnosticWithLinePosition).message || (diag as proto.Diagnostic).text;

                let result: VimQfixlistItem = {
                    lnum: dstart.line,
                    col: dstart.offset,
                    text: text,
                    valid: 1,
                    filename: (args.file as string),
                };
                return result;
            });

            return qfixlist;
        };

        this.handlers["referencesForVim"] = async (req) => {
            let args = req.arguments;
            let res: proto.ReferencesResponse = await this.requestToTsServer(
                proto.CommandTypes.References,
                args
            );
            let refs = res.body;
            if (refs) {
                let items = refs.refs.sort((i1, i2) => (i2.isDefinition ? 1 : 0) - (i1.isDefinition ? 1: 0));
                var loclist = items.map((item) => {
                    return item.file + ":" + item.start.line + ":" + item.start.offset + ":" + item.lineText;
                });
                return loclist;
            }
            else {
                return [];
            }
        };

        this.handlers["codeFixAtPositionForVim"] = async (req) => {
            debugger;
            let args: proto.SemanticDiagnosticsSyncRequestArgs = req.arguments;

            let resCodefixes: proto.GetSupportedCodeFixesResponse = await this.requestToTsServer(
                proto.CommandTypes.GetSupportedCodeFixes,
                {},
            );
            let resDiags: proto.SemanticDiagnosticsSyncResponse = await this.requestToTsServer(
                proto.CommandTypes.SemanticDiagnosticsSync,
                args
            );
            let codefixes = resCodefixes.body || [];
            let diags = resDiags.body || [];

            if (diags.length > 0) {
                let diag = diags[0];
                if (diag.code && codefixes.indexOf(diag.code.toString()) != -1) {
                    let dstart = (diag as proto.DiagnosticWithLinePosition).startLocation || diag.start;
                    let dend = (diag as proto.DiagnosticWithLinePosition).endLocation || (diag as proto.Diagnostic).end;
                    let cfArgs: proto.CodeFixRequestArgs = {
                        file: args.file,
                        errorCodes: [diag.code],
                        startLine: dstart.line,
                        startOffset: dstart.offset,
                        endLine: dend.line,
                        endOffset: dend.offset,
                    };
                    let res = await this.requestToTsServer(
                        proto.CommandTypes.GetCodeFixes,
                        cfArgs
                    );
                    return res.body;
                }
            }

            return [];
        };

    }
}

