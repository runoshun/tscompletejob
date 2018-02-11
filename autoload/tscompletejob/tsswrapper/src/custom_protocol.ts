import * as proto from "typescript/lib/protocol";

export interface CompletionsForVimRequestArgs extends proto.CompletionsRequestArgs {
    enableDetail?: boolean;
    maxDetailCount?: number;
}

export interface VimMenuInfo {
    menu: string;
    info: string;
}

export interface VimCompletionEntry {
    word: string;
    kind: string;
    menu?: string;
    info?: string;
}

export interface SignatureHelpForVimRequestArgs extends proto.SignatureHelpRequestArgs {
    disableDocumentation?: boolean;
    onlyMatched?: boolean;
}

export interface VimQfixlistItem {
    lnum: number;
    col: number;
    text: string;
    valid: number;
    filename : string;
}
