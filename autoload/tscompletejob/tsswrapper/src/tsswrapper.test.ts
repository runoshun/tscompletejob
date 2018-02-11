import { Request, Response } from "typescript/lib/protocol";
import * as proto from "typescript/lib/protocol";
import * as child_process from "child_process";
import * as readline from "readline";
import * as path from "path";
import * as tmp from "tmp";
import * as fs from "fs";

import { PromisePool } from "./utils";
import { CompletionsForVimRequestArgs, SignatureHelpForVimRequestArgs } from "./custom_protocol";

const testData = (file: string) => {
    return path.join(__dirname, "..", "testdata", file);
}

let seq = 0;
const sendCommand = (promises: PromisePool<Response>, proc: child_process.ChildProcess, command: string, args: any): Promise<Response> => {
    let req: Request = {
        type: "request",
        command: command.toString(),
        arguments: args,
        seq: seq++
    };
    let promise = promises.prepare(req.seq);
    proc.stdin.write(JSON.stringify(req) + "\r\n");
    return promise;
}

let procs: child_process.ChildProcess[] = [];
let inspectPort = 9229;

const runTests = (tsserverjs: string) => {

    let proc: child_process.ChildProcess;

    beforeAll(() => {
        let tsswrapper = path.join(__dirname, "tsswrapper.js");
        let args: string[] = ["-e", "require('" + tsswrapper + "').start('" + tsserverjs + "')"];
        if (process.env.NODE_ENV === "inspect") {
            args.unshift("--inspect=" + inspectPort++, "--inspect-brk")
        }
        proc = child_process.spawn(process.execPath, args, {
            stdio: ["pipe", "pipe", "pipe"]
        });
        procs.push(proc);

        proc.stderr.on("readable", () => {
            let buf = proc.stderr.read();
            if (buf) {
                console.error("[err on tsswrapper]: ", buf.toString());
            }
        });

        let rl = readline.createInterface({
            input: proc.stdout,
            output: proc.stdin,
            terminal: false
        });


        rl.on("line", (line) => {
            try {
                let message = line.trim();
                if (message && !message.match(/^Content-Length:/)) {
                    let res: Response = JSON.parse(message);
                    promises.resolve(res.request_seq, res);
                }
            } catch(e) {
                console.error("can't handle response", line, e);
            }
        });

    })

    let promises = new PromisePool<Response>();
    let send = (cmd: string, args: any) => sendCommand(promises, proc, cmd, args);

    const reload = (filename: string) => {
        let file = testData(filename);
        let tmpfile = tmp.tmpNameSync();
        fs.writeFileSync(tmpfile, fs.readFileSync(file));
        let args: proto.ReloadRequestArgs = {
            file,
            tmpfile,
        }
        return send("reload", args);
    }

    const open = (file: string) => {
        let args: proto.OpenRequestArgs = {
            file: testData(file),
        }
        send("open", args);
        return reload(file);
    }

    it("should return error response", async (done) => {
        let res = await send("dummy", {});

        expect(res).toEqual(expect.anything());
        expect(res.type).toBe("response");
        expect(res).toHaveProperty("success")
        done();
    });

    it("should return success for reload request", async (done) => {
        open("sample1.ts");
        let res = await reload("sample1.ts");

        expect(res).not.toBeUndefined();
        expect(res.success).toBeTruthy();
        done();
    });

    it("should return completions without details", async (done) => {
        open("sample1.ts");
        let args: CompletionsForVimRequestArgs = {
            file: testData("sample1.ts"),
            line: 27,
            offset: 4,
            prefix: "m",
            enableDetail: false,
            includeExternalModuleExports: false,
            includeInsertTextCompletions: false,
        }
        let res = await send("completionsForVim", args);

        expect(res).not.toBeUndefined();
        expect(res.success).toBeTruthy();
        expect(res.body).toHaveLength(3);
        let completion = res.body[0];
        expect(completion).toHaveProperty("word")
        expect(completion).toHaveProperty("kind")
        expect(completion).not.toHaveProperty("info")
        expect(completion).not.toHaveProperty("menu")

        done();
    });

    it("should return completions with details", async (done) => {
        open("sample1.ts");
        let args: CompletionsForVimRequestArgs = {
            file: testData("sample1.ts"),
            line: 27,
            offset: 4,
            enableDetail: true,
            includeExternalModuleExports: false,
            includeInsertTextCompletions: false,
        }
        let res = await send("completionsForVim", args);

        expect(res).not.toBeUndefined();
        expect(res.success).toBeTruthy();
        expect(res.body).toHaveLength(3);
        let completion = res.body[0];
        expect(completion).toHaveProperty("menu")
        expect(completion).toHaveProperty("word")
        expect(completion).toHaveProperty("kind")
        expect(completion).toHaveProperty("info")

        done();
    });

    it("should return signatureHelp with documentation", async (done) => {
        open("sample1.ts");
        let args: SignatureHelpForVimRequestArgs = {
            file: testData("sample1.ts"),
            line: 29,
            offset: 11,
            disableDocumentation: false,
            onlyMatched: true,
        }
        let res = await send("signatureHelpForVim", args);

        expect(res).not.toBeUndefined();
        expect(res.success).toBeTruthy();
        expect(res.body).toHaveLength(2);

        let help = res.body[0];
        expect(help).toHaveProperty("abbr");
        expect(help).toHaveProperty("dup");
        expect(help).toHaveProperty("empty");
        expect(help).toHaveProperty("word");
        expect(help).toHaveProperty("info");

        done();
    })

    it("should return signatureHelp without documentation", async (done) => {
        open("sample1.ts");
        let args: SignatureHelpForVimRequestArgs = {
            file: testData("sample1.ts"),
            line: 29,
            offset: 11,
            disableDocumentation: true,
            onlyMatched: true,
        }
        let res = await send("signatureHelpForVim", args);

        expect(res).not.toBeUndefined();
        expect(res.success).toBeTruthy();
        expect(res.body).toHaveLength(2);

        let help = res.body[0];
        expect(help).toHaveProperty("abbr");
        expect(help).toHaveProperty("dup");
        expect(help).toHaveProperty("empty");
        expect(help).toHaveProperty("word");
        expect(help).not.toHaveProperty("info");

        done();
    });

    it("should return qfixlist", async (done) => {
        open("errors.ts");
        let args: proto.SyntacticDiagnosticsSyncRequestArgs = {
            file: testData("errors.ts"),
            includeLinePosition: true
        };

        let res = await send("qfixlistForVim", args);
        expect(res).not.toBeUndefined();
        expect(res.success).toBeTruthy();
        expect(res.body).toHaveLength(3);

        let args2: proto.SyntacticDiagnosticsSyncRequestArgs = {
            file: testData("errors.ts"),
            includeLinePosition: false,
        };

        let res2 = await send("qfixlistForVim", args2);
        expect(res2).not.toBeUndefined();
        expect(res2.success).toBeTruthy();
        expect(res2.body).toHaveLength(3);

        done();
    });

    it("should return references", async (done) => {
        open("sample1.ts");
        let args: proto.ReferencesRequest["arguments"] = {
            file: testData("sample1.ts"),
            line: 6,
            offset: 7,
        };

        let res = await send("referencesForVim", args);

        expect(res).not.toBeUndefined();
        expect(res.success).toBeTruthy();
        expect(res.body).toHaveLength(3);
        done()
    });

    it("should return codefix", async (done) => {
        jest.setTimeout(10000000)
        open("codefix.ts");
        let args: proto.ReferencesRequest["arguments"] = {
            file: testData("codefix.ts"),
            line: 6,
            offset: 7,
        };

        let res = await send("codeFixAtPositionForVim", args);

        expect(res).not.toBeUndefined();
        expect(res.success).toBeTruthy();
        expect(res.body).toHaveLength(1);
        done();
    });
}

//describe("tests for typescript 2.0.10", () => {
//    runTests(testData("tsserver2010.js"));
//});
//
//describe("tests for typescript 2.1.6", () => {
//    runTests(testData("tsserver216.js"));
//});

describe("tests for typescript 2.2.0", () => {
    runTests(testData("tsserver220.js"));
});

describe("tests for typescript 2.3.4", () => {
    runTests(testData("tsserver234.js"));
});

describe("tests for typescript 2.4.2", () => {
    runTests(testData("tsserver242.js"));
});

describe("tests for typescript 2.5.3", () => {
    runTests(testData("tsserver253.js"));
});

describe("tests for typescript 2.6.2", () => {
    runTests(testData("tsserver262.js"));
});

describe("tests for typescript 2.7.1", () => {
    runTests(testData("tsserver271.js"));
});

afterAll(() => {
    procs.forEach(proc => proc.kill());
})
