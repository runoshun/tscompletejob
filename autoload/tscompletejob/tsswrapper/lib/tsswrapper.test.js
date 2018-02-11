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
const child_process = require("child_process");
const readline = require("readline");
const path = require("path");
const tmp = require("tmp");
const fs = require("fs");
const utils_1 = require("./utils");
const testData = (file) => {
    return path.join(__dirname, "..", "testdata", file);
};
let seq = 0;
const sendCommand = (promises, proc, command, args) => {
    let req = {
        type: "request",
        command: command.toString(),
        arguments: args,
        seq: seq++
    };
    let promise = promises.prepare(req.seq);
    proc.stdin.write(JSON.stringify(req) + "\r\n");
    return promise;
};
let procs = [];
let inspectPort = 9229;
const runTests = (tsserverjs) => {
    let proc;
    beforeAll(() => {
        let tsswrapper = path.join(__dirname, "tsswrapper.js");
        let args = ["-e", "require('" + tsswrapper + "').start('" + tsserverjs + "')"];
        if (process.env.NODE_ENV === "inspect") {
            args.unshift("--inspect=" + inspectPort++, "--inspect-brk");
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
                    let res = JSON.parse(message);
                    promises.resolve(res.request_seq, res);
                }
            }
            catch (e) {
                console.error("can't handle response", line, e);
            }
        });
    });
    let promises = new utils_1.PromisePool();
    let send = (cmd, args) => sendCommand(promises, proc, cmd, args);
    const reload = (filename) => {
        let file = testData(filename);
        let tmpfile = tmp.tmpNameSync();
        fs.writeFileSync(tmpfile, fs.readFileSync(file));
        let args = {
            file,
            tmpfile,
        };
        return send("reload", args);
    };
    const open = (file) => {
        let args = {
            file: testData(file),
        };
        send("open", args);
        return reload(file);
    };
    it("should return error response", (done) => __awaiter(this, void 0, void 0, function* () {
        let res = yield send("dummy", {});
        expect(res).toEqual(expect.anything());
        expect(res.type).toBe("response");
        expect(res).toHaveProperty("success");
        done();
    }));
    it("should return success for reload request", (done) => __awaiter(this, void 0, void 0, function* () {
        open("sample1.ts");
        let res = yield reload("sample1.ts");
        expect(res).not.toBeUndefined();
        expect(res.success).toBeTruthy();
        done();
    }));
    it("should return completions without details", (done) => __awaiter(this, void 0, void 0, function* () {
        open("sample1.ts");
        let args = {
            file: testData("sample1.ts"),
            line: 27,
            offset: 4,
            prefix: "m",
            enableDetail: false,
            includeExternalModuleExports: false,
            includeInsertTextCompletions: false,
        };
        let res = yield send("completionsForVim", args);
        expect(res).not.toBeUndefined();
        expect(res.success).toBeTruthy();
        expect(res.body).toHaveLength(3);
        let completion = res.body[0];
        expect(completion).toHaveProperty("word");
        expect(completion).toHaveProperty("kind");
        expect(completion).not.toHaveProperty("info");
        expect(completion).not.toHaveProperty("menu");
        done();
    }));
    it("should return completions with details", (done) => __awaiter(this, void 0, void 0, function* () {
        open("sample1.ts");
        let args = {
            file: testData("sample1.ts"),
            line: 27,
            offset: 4,
            enableDetail: true,
            includeExternalModuleExports: false,
            includeInsertTextCompletions: false,
        };
        let res = yield send("completionsForVim", args);
        expect(res).not.toBeUndefined();
        expect(res.success).toBeTruthy();
        expect(res.body).toHaveLength(3);
        let completion = res.body[0];
        expect(completion).toHaveProperty("menu");
        expect(completion).toHaveProperty("word");
        expect(completion).toHaveProperty("kind");
        expect(completion).toHaveProperty("info");
        done();
    }));
    it("should return signatureHelp with documentation", (done) => __awaiter(this, void 0, void 0, function* () {
        open("sample1.ts");
        let args = {
            file: testData("sample1.ts"),
            line: 29,
            offset: 11,
            disableDocumentation: false,
            onlyMatched: true,
        };
        let res = yield send("signatureHelpForVim", args);
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
    }));
    it("should return signatureHelp without documentation", (done) => __awaiter(this, void 0, void 0, function* () {
        open("sample1.ts");
        let args = {
            file: testData("sample1.ts"),
            line: 29,
            offset: 11,
            disableDocumentation: true,
            onlyMatched: true,
        };
        let res = yield send("signatureHelpForVim", args);
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
    }));
    it("should return qfixlist", (done) => __awaiter(this, void 0, void 0, function* () {
        open("errors.ts");
        let args = {
            file: testData("errors.ts"),
            includeLinePosition: true
        };
        let res = yield send("qfixlistForVim", args);
        expect(res).not.toBeUndefined();
        expect(res.success).toBeTruthy();
        expect(res.body).toHaveLength(3);
        let args2 = {
            file: testData("errors.ts"),
            includeLinePosition: false,
        };
        let res2 = yield send("qfixlistForVim", args2);
        expect(res2).not.toBeUndefined();
        expect(res2.success).toBeTruthy();
        expect(res2.body).toHaveLength(3);
        done();
    }));
    it("should return references", (done) => __awaiter(this, void 0, void 0, function* () {
        open("sample1.ts");
        let args = {
            file: testData("sample1.ts"),
            line: 6,
            offset: 7,
        };
        let res = yield send("referencesForVim", args);
        expect(res).not.toBeUndefined();
        expect(res.success).toBeTruthy();
        expect(res.body).toHaveLength(3);
        done();
    }));
    it("should return codefix", (done) => __awaiter(this, void 0, void 0, function* () {
        jest.setTimeout(10000000);
        open("codefix.ts");
        let args = {
            file: testData("codefix.ts"),
            line: 6,
            offset: 7,
        };
        let res = yield send("codeFixAtPositionForVim", args);
        expect(res).not.toBeUndefined();
        expect(res.success).toBeTruthy();
        expect(res.body).toHaveLength(1);
        done();
    }));
};
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
});
//# sourceMappingURL=data:application/json;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoidHNzd3JhcHBlci50ZXN0LmpzIiwic291cmNlUm9vdCI6IiIsInNvdXJjZXMiOlsiLi4vc3JjL3Rzc3dyYXBwZXIudGVzdC50cyJdLCJuYW1lcyI6W10sIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7O0FBRUEsK0NBQStDO0FBQy9DLHFDQUFxQztBQUNyQyw2QkFBNkI7QUFDN0IsMkJBQTJCO0FBQzNCLHlCQUF5QjtBQUV6QixtQ0FBc0M7QUFHdEMsTUFBTSxRQUFRLEdBQUcsQ0FBQyxJQUFZLEVBQUUsRUFBRTtJQUM5QixNQUFNLENBQUMsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsSUFBSSxFQUFFLFVBQVUsRUFBRSxJQUFJLENBQUMsQ0FBQztBQUN4RCxDQUFDLENBQUE7QUFFRCxJQUFJLEdBQUcsR0FBRyxDQUFDLENBQUM7QUFDWixNQUFNLFdBQVcsR0FBRyxDQUFDLFFBQStCLEVBQUUsSUFBZ0MsRUFBRSxPQUFlLEVBQUUsSUFBUyxFQUFxQixFQUFFO0lBQ3JJLElBQUksR0FBRyxHQUFZO1FBQ2YsSUFBSSxFQUFFLFNBQVM7UUFDZixPQUFPLEVBQUUsT0FBTyxDQUFDLFFBQVEsRUFBRTtRQUMzQixTQUFTLEVBQUUsSUFBSTtRQUNmLEdBQUcsRUFBRSxHQUFHLEVBQUU7S0FDYixDQUFDO0lBQ0YsSUFBSSxPQUFPLEdBQUcsUUFBUSxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsR0FBRyxDQUFDLENBQUM7SUFDeEMsSUFBSSxDQUFDLEtBQUssQ0FBQyxLQUFLLENBQUMsSUFBSSxDQUFDLFNBQVMsQ0FBQyxHQUFHLENBQUMsR0FBRyxNQUFNLENBQUMsQ0FBQztJQUMvQyxNQUFNLENBQUMsT0FBTyxDQUFDO0FBQ25CLENBQUMsQ0FBQTtBQUVELElBQUksS0FBSyxHQUFpQyxFQUFFLENBQUM7QUFDN0MsSUFBSSxXQUFXLEdBQUcsSUFBSSxDQUFDO0FBRXZCLE1BQU0sUUFBUSxHQUFHLENBQUMsVUFBa0IsRUFBRSxFQUFFO0lBRXBDLElBQUksSUFBZ0MsQ0FBQztJQUVyQyxTQUFTLENBQUMsR0FBRyxFQUFFO1FBQ1gsSUFBSSxVQUFVLEdBQUcsSUFBSSxDQUFDLElBQUksQ0FBQyxTQUFTLEVBQUUsZUFBZSxDQUFDLENBQUM7UUFDdkQsSUFBSSxJQUFJLEdBQWEsQ0FBQyxJQUFJLEVBQUUsV0FBVyxHQUFHLFVBQVUsR0FBRyxZQUFZLEdBQUcsVUFBVSxHQUFHLElBQUksQ0FBQyxDQUFDO1FBQ3pGLEVBQUUsQ0FBQyxDQUFDLE9BQU8sQ0FBQyxHQUFHLENBQUMsUUFBUSxLQUFLLFNBQVMsQ0FBQyxDQUFDLENBQUM7WUFDckMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxZQUFZLEdBQUcsV0FBVyxFQUFFLEVBQUUsZUFBZSxDQUFDLENBQUE7UUFDL0QsQ0FBQztRQUNELElBQUksR0FBRyxhQUFhLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxRQUFRLEVBQUUsSUFBSSxFQUFFO1lBQy9DLEtBQUssRUFBRSxDQUFDLE1BQU0sRUFBRSxNQUFNLEVBQUUsTUFBTSxDQUFDO1NBQ2xDLENBQUMsQ0FBQztRQUNILEtBQUssQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUM7UUFFakIsSUFBSSxDQUFDLE1BQU0sQ0FBQyxFQUFFLENBQUMsVUFBVSxFQUFFLEdBQUcsRUFBRTtZQUM1QixJQUFJLEdBQUcsR0FBRyxJQUFJLENBQUMsTUFBTSxDQUFDLElBQUksRUFBRSxDQUFDO1lBQzdCLEVBQUUsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxDQUFDLENBQUM7Z0JBQ04sT0FBTyxDQUFDLEtBQUssQ0FBQyx1QkFBdUIsRUFBRSxHQUFHLENBQUMsUUFBUSxFQUFFLENBQUMsQ0FBQztZQUMzRCxDQUFDO1FBQ0wsQ0FBQyxDQUFDLENBQUM7UUFFSCxJQUFJLEVBQUUsR0FBRyxRQUFRLENBQUMsZUFBZSxDQUFDO1lBQzlCLEtBQUssRUFBRSxJQUFJLENBQUMsTUFBTTtZQUNsQixNQUFNLEVBQUUsSUFBSSxDQUFDLEtBQUs7WUFDbEIsUUFBUSxFQUFFLEtBQUs7U0FDbEIsQ0FBQyxDQUFDO1FBR0gsRUFBRSxDQUFDLEVBQUUsQ0FBQyxNQUFNLEVBQUUsQ0FBQyxJQUFJLEVBQUUsRUFBRTtZQUNuQixJQUFJLENBQUM7Z0JBQ0QsSUFBSSxPQUFPLEdBQUcsSUFBSSxDQUFDLElBQUksRUFBRSxDQUFDO2dCQUMxQixFQUFFLENBQUMsQ0FBQyxPQUFPLElBQUksQ0FBQyxPQUFPLENBQUMsS0FBSyxDQUFDLGtCQUFrQixDQUFDLENBQUMsQ0FBQyxDQUFDO29CQUNoRCxJQUFJLEdBQUcsR0FBYSxJQUFJLENBQUMsS0FBSyxDQUFDLE9BQU8sQ0FBQyxDQUFDO29CQUN4QyxRQUFRLENBQUMsT0FBTyxDQUFDLEdBQUcsQ0FBQyxXQUFXLEVBQUUsR0FBRyxDQUFDLENBQUM7Z0JBQzNDLENBQUM7WUFDTCxDQUFDO1lBQUMsS0FBSyxDQUFBLENBQUMsQ0FBQyxDQUFDLENBQUMsQ0FBQztnQkFDUixPQUFPLENBQUMsS0FBSyxDQUFDLHVCQUF1QixFQUFFLElBQUksRUFBRSxDQUFDLENBQUMsQ0FBQztZQUNwRCxDQUFDO1FBQ0wsQ0FBQyxDQUFDLENBQUM7SUFFUCxDQUFDLENBQUMsQ0FBQTtJQUVGLElBQUksUUFBUSxHQUFHLElBQUksbUJBQVcsRUFBWSxDQUFDO0lBQzNDLElBQUksSUFBSSxHQUFHLENBQUMsR0FBVyxFQUFFLElBQVMsRUFBRSxFQUFFLENBQUMsV0FBVyxDQUFDLFFBQVEsRUFBRSxJQUFJLEVBQUUsR0FBRyxFQUFFLElBQUksQ0FBQyxDQUFDO0lBRTlFLE1BQU0sTUFBTSxHQUFHLENBQUMsUUFBZ0IsRUFBRSxFQUFFO1FBQ2hDLElBQUksSUFBSSxHQUFHLFFBQVEsQ0FBQyxRQUFRLENBQUMsQ0FBQztRQUM5QixJQUFJLE9BQU8sR0FBRyxHQUFHLENBQUMsV0FBVyxFQUFFLENBQUM7UUFDaEMsRUFBRSxDQUFDLGFBQWEsQ0FBQyxPQUFPLEVBQUUsRUFBRSxDQUFDLFlBQVksQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDO1FBQ2pELElBQUksSUFBSSxHQUE0QjtZQUNoQyxJQUFJO1lBQ0osT0FBTztTQUNWLENBQUE7UUFDRCxNQUFNLENBQUMsSUFBSSxDQUFDLFFBQVEsRUFBRSxJQUFJLENBQUMsQ0FBQztJQUNoQyxDQUFDLENBQUE7SUFFRCxNQUFNLElBQUksR0FBRyxDQUFDLElBQVksRUFBRSxFQUFFO1FBQzFCLElBQUksSUFBSSxHQUEwQjtZQUM5QixJQUFJLEVBQUUsUUFBUSxDQUFDLElBQUksQ0FBQztTQUN2QixDQUFBO1FBQ0QsSUFBSSxDQUFDLE1BQU0sRUFBRSxJQUFJLENBQUMsQ0FBQztRQUNuQixNQUFNLENBQUMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDO0lBQ3hCLENBQUMsQ0FBQTtJQUVELEVBQUUsQ0FBQyw4QkFBOEIsRUFBRSxDQUFPLElBQUksRUFBRSxFQUFFO1FBQzlDLElBQUksR0FBRyxHQUFHLE1BQU0sSUFBSSxDQUFDLE9BQU8sRUFBRSxFQUFFLENBQUMsQ0FBQztRQUVsQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsT0FBTyxDQUFDLE1BQU0sQ0FBQyxRQUFRLEVBQUUsQ0FBQyxDQUFDO1FBQ3ZDLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxDQUFDO1FBQ2xDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxjQUFjLENBQUMsU0FBUyxDQUFDLENBQUE7UUFDckMsSUFBSSxFQUFFLENBQUM7SUFDWCxDQUFDLENBQUEsQ0FBQyxDQUFDO0lBRUgsRUFBRSxDQUFDLDBDQUEwQyxFQUFFLENBQU8sSUFBSSxFQUFFLEVBQUU7UUFDMUQsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBQ25CLElBQUksR0FBRyxHQUFHLE1BQU0sTUFBTSxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBRXJDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsYUFBYSxFQUFFLENBQUM7UUFDaEMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQyxVQUFVLEVBQUUsQ0FBQztRQUNqQyxJQUFJLEVBQUUsQ0FBQztJQUNYLENBQUMsQ0FBQSxDQUFDLENBQUM7SUFFSCxFQUFFLENBQUMsMkNBQTJDLEVBQUUsQ0FBTyxJQUFJLEVBQUUsRUFBRTtRQUMzRCxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDbkIsSUFBSSxJQUFJLEdBQWlDO1lBQ3JDLElBQUksRUFBRSxRQUFRLENBQUMsWUFBWSxDQUFDO1lBQzVCLElBQUksRUFBRSxFQUFFO1lBQ1IsTUFBTSxFQUFFLENBQUM7WUFDVCxNQUFNLEVBQUUsR0FBRztZQUNYLFlBQVksRUFBRSxLQUFLO1lBQ25CLDRCQUE0QixFQUFFLEtBQUs7WUFDbkMsNEJBQTRCLEVBQUUsS0FBSztTQUN0QyxDQUFBO1FBQ0QsSUFBSSxHQUFHLEdBQUcsTUFBTSxJQUFJLENBQUMsbUJBQW1CLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFFaEQsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxhQUFhLEVBQUUsQ0FBQztRQUNoQyxNQUFNLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxDQUFDLFVBQVUsRUFBRSxDQUFDO1FBQ2pDLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ2pDLElBQUksVUFBVSxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDN0IsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsQ0FBQTtRQUN6QyxNQUFNLENBQUMsVUFBVSxDQUFDLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxDQUFBO1FBQ3pDLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxDQUFBO1FBQzdDLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQyxHQUFHLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxDQUFBO1FBRTdDLElBQUksRUFBRSxDQUFDO0lBQ1gsQ0FBQyxDQUFBLENBQUMsQ0FBQztJQUVILEVBQUUsQ0FBQyx3Q0FBd0MsRUFBRSxDQUFPLElBQUksRUFBRSxFQUFFO1FBQ3hELElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUNuQixJQUFJLElBQUksR0FBaUM7WUFDckMsSUFBSSxFQUFFLFFBQVEsQ0FBQyxZQUFZLENBQUM7WUFDNUIsSUFBSSxFQUFFLEVBQUU7WUFDUixNQUFNLEVBQUUsQ0FBQztZQUNULFlBQVksRUFBRSxJQUFJO1lBQ2xCLDRCQUE0QixFQUFFLEtBQUs7WUFDbkMsNEJBQTRCLEVBQUUsS0FBSztTQUN0QyxDQUFBO1FBQ0QsSUFBSSxHQUFHLEdBQUcsTUFBTSxJQUFJLENBQUMsbUJBQW1CLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFFaEQsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxhQUFhLEVBQUUsQ0FBQztRQUNoQyxNQUFNLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxDQUFDLFVBQVUsRUFBRSxDQUFDO1FBQ2pDLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ2pDLElBQUksVUFBVSxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDN0IsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsQ0FBQTtRQUN6QyxNQUFNLENBQUMsVUFBVSxDQUFDLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxDQUFBO1FBQ3pDLE1BQU0sQ0FBQyxVQUFVLENBQUMsQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLENBQUE7UUFDekMsTUFBTSxDQUFDLFVBQVUsQ0FBQyxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsQ0FBQTtRQUV6QyxJQUFJLEVBQUUsQ0FBQztJQUNYLENBQUMsQ0FBQSxDQUFDLENBQUM7SUFFSCxFQUFFLENBQUMsZ0RBQWdELEVBQUUsQ0FBTyxJQUFJLEVBQUUsRUFBRTtRQUNoRSxJQUFJLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDbkIsSUFBSSxJQUFJLEdBQW1DO1lBQ3ZDLElBQUksRUFBRSxRQUFRLENBQUMsWUFBWSxDQUFDO1lBQzVCLElBQUksRUFBRSxFQUFFO1lBQ1IsTUFBTSxFQUFFLEVBQUU7WUFDVixvQkFBb0IsRUFBRSxLQUFLO1lBQzNCLFdBQVcsRUFBRSxJQUFJO1NBQ3BCLENBQUE7UUFDRCxJQUFJLEdBQUcsR0FBRyxNQUFNLElBQUksQ0FBQyxxQkFBcUIsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUVsRCxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLGFBQWEsRUFBRSxDQUFDO1FBQ2hDLE1BQU0sQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLENBQUMsVUFBVSxFQUFFLENBQUM7UUFDakMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFFakMsSUFBSSxJQUFJLEdBQUcsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUN2QixNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3BDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxjQUFjLENBQUMsS0FBSyxDQUFDLENBQUM7UUFDbkMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLGNBQWMsQ0FBQyxPQUFPLENBQUMsQ0FBQztRQUNyQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsY0FBYyxDQUFDLE1BQU0sQ0FBQyxDQUFDO1FBQ3BDLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxjQUFjLENBQUMsTUFBTSxDQUFDLENBQUM7UUFFcEMsSUFBSSxFQUFFLENBQUM7SUFDWCxDQUFDLENBQUEsQ0FBQyxDQUFBO0lBRUYsRUFBRSxDQUFDLG1EQUFtRCxFQUFFLENBQU8sSUFBSSxFQUFFLEVBQUU7UUFDbkUsSUFBSSxDQUFDLFlBQVksQ0FBQyxDQUFDO1FBQ25CLElBQUksSUFBSSxHQUFtQztZQUN2QyxJQUFJLEVBQUUsUUFBUSxDQUFDLFlBQVksQ0FBQztZQUM1QixJQUFJLEVBQUUsRUFBRTtZQUNSLE1BQU0sRUFBRSxFQUFFO1lBQ1Ysb0JBQW9CLEVBQUUsSUFBSTtZQUMxQixXQUFXLEVBQUUsSUFBSTtTQUNwQixDQUFBO1FBQ0QsSUFBSSxHQUFHLEdBQUcsTUFBTSxJQUFJLENBQUMscUJBQXFCLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFFbEQsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxhQUFhLEVBQUUsQ0FBQztRQUNoQyxNQUFNLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxDQUFDLFVBQVUsRUFBRSxDQUFDO1FBQ2pDLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRWpDLElBQUksSUFBSSxHQUFHLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDdkIsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNwQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsY0FBYyxDQUFDLEtBQUssQ0FBQyxDQUFDO1FBQ25DLE1BQU0sQ0FBQyxJQUFJLENBQUMsQ0FBQyxjQUFjLENBQUMsT0FBTyxDQUFDLENBQUM7UUFDckMsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUNwQyxNQUFNLENBQUMsSUFBSSxDQUFDLENBQUMsR0FBRyxDQUFDLGNBQWMsQ0FBQyxNQUFNLENBQUMsQ0FBQztRQUV4QyxJQUFJLEVBQUUsQ0FBQztJQUNYLENBQUMsQ0FBQSxDQUFDLENBQUM7SUFFSCxFQUFFLENBQUMsd0JBQXdCLEVBQUUsQ0FBTyxJQUFJLEVBQUUsRUFBRTtRQUN4QyxJQUFJLENBQUMsV0FBVyxDQUFDLENBQUM7UUFDbEIsSUFBSSxJQUFJLEdBQThDO1lBQ2xELElBQUksRUFBRSxRQUFRLENBQUMsV0FBVyxDQUFDO1lBQzNCLG1CQUFtQixFQUFFLElBQUk7U0FDNUIsQ0FBQztRQUVGLElBQUksR0FBRyxHQUFHLE1BQU0sSUFBSSxDQUFDLGdCQUFnQixFQUFFLElBQUksQ0FBQyxDQUFDO1FBQzdDLE1BQU0sQ0FBQyxHQUFHLENBQUMsQ0FBQyxHQUFHLENBQUMsYUFBYSxFQUFFLENBQUM7UUFDaEMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxPQUFPLENBQUMsQ0FBQyxVQUFVLEVBQUUsQ0FBQztRQUNqQyxNQUFNLENBQUMsR0FBRyxDQUFDLElBQUksQ0FBQyxDQUFDLFlBQVksQ0FBQyxDQUFDLENBQUMsQ0FBQztRQUVqQyxJQUFJLEtBQUssR0FBOEM7WUFDbkQsSUFBSSxFQUFFLFFBQVEsQ0FBQyxXQUFXLENBQUM7WUFDM0IsbUJBQW1CLEVBQUUsS0FBSztTQUM3QixDQUFDO1FBRUYsSUFBSSxJQUFJLEdBQUcsTUFBTSxJQUFJLENBQUMsZ0JBQWdCLEVBQUUsS0FBSyxDQUFDLENBQUM7UUFDL0MsTUFBTSxDQUFDLElBQUksQ0FBQyxDQUFDLEdBQUcsQ0FBQyxhQUFhLEVBQUUsQ0FBQztRQUNqQyxNQUFNLENBQUMsSUFBSSxDQUFDLE9BQU8sQ0FBQyxDQUFDLFVBQVUsRUFBRSxDQUFDO1FBQ2xDLE1BQU0sQ0FBQyxJQUFJLENBQUMsSUFBSSxDQUFDLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBRWxDLElBQUksRUFBRSxDQUFDO0lBQ1gsQ0FBQyxDQUFBLENBQUMsQ0FBQztJQUVILEVBQUUsQ0FBQywwQkFBMEIsRUFBRSxDQUFPLElBQUksRUFBRSxFQUFFO1FBQzFDLElBQUksQ0FBQyxZQUFZLENBQUMsQ0FBQztRQUNuQixJQUFJLElBQUksR0FBeUM7WUFDN0MsSUFBSSxFQUFFLFFBQVEsQ0FBQyxZQUFZLENBQUM7WUFDNUIsSUFBSSxFQUFFLENBQUM7WUFDUCxNQUFNLEVBQUUsQ0FBQztTQUNaLENBQUM7UUFFRixJQUFJLEdBQUcsR0FBRyxNQUFNLElBQUksQ0FBQyxrQkFBa0IsRUFBRSxJQUFJLENBQUMsQ0FBQztRQUUvQyxNQUFNLENBQUMsR0FBRyxDQUFDLENBQUMsR0FBRyxDQUFDLGFBQWEsRUFBRSxDQUFDO1FBQ2hDLE1BQU0sQ0FBQyxHQUFHLENBQUMsT0FBTyxDQUFDLENBQUMsVUFBVSxFQUFFLENBQUM7UUFDakMsTUFBTSxDQUFDLEdBQUcsQ0FBQyxJQUFJLENBQUMsQ0FBQyxZQUFZLENBQUMsQ0FBQyxDQUFDLENBQUM7UUFDakMsSUFBSSxFQUFFLENBQUE7SUFDVixDQUFDLENBQUEsQ0FBQyxDQUFDO0lBRUgsRUFBRSxDQUFDLHVCQUF1QixFQUFFLENBQU8sSUFBSSxFQUFFLEVBQUU7UUFDdkMsSUFBSSxDQUFDLFVBQVUsQ0FBQyxRQUFRLENBQUMsQ0FBQTtRQUN6QixJQUFJLENBQUMsWUFBWSxDQUFDLENBQUM7UUFDbkIsSUFBSSxJQUFJLEdBQXlDO1lBQzdDLElBQUksRUFBRSxRQUFRLENBQUMsWUFBWSxDQUFDO1lBQzVCLElBQUksRUFBRSxDQUFDO1lBQ1AsTUFBTSxFQUFFLENBQUM7U0FDWixDQUFDO1FBRUYsSUFBSSxHQUFHLEdBQUcsTUFBTSxJQUFJLENBQUMseUJBQXlCLEVBQUUsSUFBSSxDQUFDLENBQUM7UUFFdEQsTUFBTSxDQUFDLEdBQUcsQ0FBQyxDQUFDLEdBQUcsQ0FBQyxhQUFhLEVBQUUsQ0FBQztRQUNoQyxNQUFNLENBQUMsR0FBRyxDQUFDLE9BQU8sQ0FBQyxDQUFDLFVBQVUsRUFBRSxDQUFDO1FBQ2pDLE1BQU0sQ0FBQyxHQUFHLENBQUMsSUFBSSxDQUFDLENBQUMsWUFBWSxDQUFDLENBQUMsQ0FBQyxDQUFDO1FBQ2pDLElBQUksRUFBRSxDQUFDO0lBQ1gsQ0FBQyxDQUFBLENBQUMsQ0FBQztBQUNQLENBQUMsQ0FBQTtBQUVELGlEQUFpRDtBQUNqRCw0Q0FBNEM7QUFDNUMsS0FBSztBQUNMLEVBQUU7QUFDRixnREFBZ0Q7QUFDaEQsMkNBQTJDO0FBQzNDLEtBQUs7QUFFTCxRQUFRLENBQUMsNEJBQTRCLEVBQUUsR0FBRyxFQUFFO0lBQ3hDLFFBQVEsQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDO0FBQ3pDLENBQUMsQ0FBQyxDQUFDO0FBRUgsUUFBUSxDQUFDLDRCQUE0QixFQUFFLEdBQUcsRUFBRTtJQUN4QyxRQUFRLENBQUMsUUFBUSxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQztBQUN6QyxDQUFDLENBQUMsQ0FBQztBQUVILFFBQVEsQ0FBQyw0QkFBNEIsRUFBRSxHQUFHLEVBQUU7SUFDeEMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUM7QUFDekMsQ0FBQyxDQUFDLENBQUM7QUFFSCxRQUFRLENBQUMsNEJBQTRCLEVBQUUsR0FBRyxFQUFFO0lBQ3hDLFFBQVEsQ0FBQyxRQUFRLENBQUMsZ0JBQWdCLENBQUMsQ0FBQyxDQUFDO0FBQ3pDLENBQUMsQ0FBQyxDQUFDO0FBRUgsUUFBUSxDQUFDLDRCQUE0QixFQUFFLEdBQUcsRUFBRTtJQUN4QyxRQUFRLENBQUMsUUFBUSxDQUFDLGdCQUFnQixDQUFDLENBQUMsQ0FBQztBQUN6QyxDQUFDLENBQUMsQ0FBQztBQUVILFFBQVEsQ0FBQyw0QkFBNEIsRUFBRSxHQUFHLEVBQUU7SUFDeEMsUUFBUSxDQUFDLFFBQVEsQ0FBQyxnQkFBZ0IsQ0FBQyxDQUFDLENBQUM7QUFDekMsQ0FBQyxDQUFDLENBQUM7QUFFSCxRQUFRLENBQUMsR0FBRyxFQUFFO0lBQ1YsS0FBSyxDQUFDLE9BQU8sQ0FBQyxJQUFJLENBQUMsRUFBRSxDQUFDLElBQUksQ0FBQyxJQUFJLEVBQUUsQ0FBQyxDQUFDO0FBQ3ZDLENBQUMsQ0FBQyxDQUFBIn0=